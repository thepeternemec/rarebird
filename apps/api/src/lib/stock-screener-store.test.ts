import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import postgres from "postgres";
import type { StockFrame } from "@rarebird/contracts";
import { stockFixture } from "./stock-screener-fixtures.js";
import { STOCK_SCREENER_SCHEMA } from "./stock-screener-schema.js";
import { readStockScreener, runStockScreener } from "./stock-screener-store.js";
import { deliverStockEvents } from "./stock-screener-delivery.js";

const connection = process.env.RAREBIRD_INTELLIGENCE_TEST_DATABASE_URL;
if (connection) {
  const url = new URL(connection);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/rarebird_intelligence_test") throw new Error("Stock tests require the dedicated localhost test database.");
}
const reset = "truncate public.rarebird_stock_outbox,public.rarebird_stock_events,public.rarebird_stock_alerts,public.rarebird_stock_worker,public.rarebird_stock_bars restart identity";
function configure() {
  process.env.ALPACA_API_KEY = "synthetic-test"; process.env.ALPACA_SECRET_KEY = "synthetic-test";
  process.env.RAREBIRD_STOCK_FEED = "iex";
  process.env.RAREBIRD_STOCK_SCREENER_WEBHOOK_URL = "https://example.com/test-receiver";
  process.env.RAREBIRD_STOCK_SCREENER_WEBHOOK_SECRET = "test-secret-".repeat(4);
}
function refresh(frame: StockFrame, now: number) {
  frame.received_at = frame.session_checked_at = new Date(now).toISOString();
  for (const a of Object.values(frame.instruments)) a.quote!.time = now - 1000;
  return frame;
}
test("Postgres stock lifecycle is atomic, cursor-replayable and idempotent, with signed durable delivery", { skip: !connection, timeout: 45000 }, async () => {
  const saved = { ...process.env }, sql = postgres(connection!, { prepare: false, max: 3, onnotice: () => {} });
  configure();
  let now = Date.parse("2026-11-25T16:00:00Z"), frame = stockFixture(), fetches = 0;
  const deps = { sql, now: () => now, fetchFrame: async () => { fetches++; return frame; }, deliver: false };
  try {
    await sql.unsafe(STOCK_SCREENER_SCHEMA); await sql.unsafe(reset);
    assert.equal((await runStockScreener(deps)).alerts, 4);
    const initial = await readStockScreener({ limit: 2, after: "0" }, { sql, now });
    assert.equal(initial.status, "monitoring"); assert.equal(initial.active.length, 4);
    assert.equal(initial.events.length, 2); assert.equal(initial.has_more, true);
    assert.equal(initial.next_cursor, "2"); assert.equal(initial.delivery.pending, 4);
    const original = initial.active.find(a => a.symbol === "NVDA")!;
    assert.equal((await runStockScreener(deps)).events, 0);
    const page2 = await readStockScreener({ after: initial.next_cursor, limit: 2 }, { sql, now });
    assert.equal(page2.events.length, 2); assert.equal(page2.has_more, false); assert.equal(page2.next_cursor, "4");
    assert.deepEqual(page2.active.find(a => a.symbol === "NVDA")!.reference, original.reference);
    const before = fetches;
    await readStockScreener({}, { sql, now }); await readStockScreener({}, { sql, now });
    assert.equal(fetches, before, "public reads never collect");
    const bodies: string[] = [], eventIds = new Set<string>();
    const receiver: typeof fetch = async (_url, init) => {
      const headers = init!.headers as Record<string, string>, body = String(init!.body);
      assert.equal(headers["X-Rarebird-Signature"], "v1=" + createHmac("sha256", process.env.RAREBIRD_STOCK_SCREENER_WEBHOOK_SECRET!).update(`${headers["X-Rarebird-Timestamp"]}.${body}`).digest("hex"));
      eventIds.add(headers["X-Rarebird-Event-ID"]!); bodies.push(body);
      assert.notEqual(JSON.parse(body).sequence, "0");
      return new Response(null, { status: bodies.length === 1 ? 503 : 204 });
    };
    assert.equal((await deliverStockEvents(sql, { fetcher: receiver, now: () => now })).delivered, 3);
    now += 31000;
    assert.equal((await deliverStockEvents(sql, { fetcher: receiver, now: () => now })).delivered, 1);
    assert.equal(eventIds.size, 4); assert.equal(bodies.length, 5, "retry uses the same event ID");
    assert.equal((await deliverStockEvents(sql, { fetcher: receiver, now: () => now })).delivered, 0);
    const held = await runStockScreener({ ...deps, fetchFrame: async () => { throw new Error("stock_feed_unavailable"); } });
    assert.equal(held.events, 4);
    const heldRead = await readStockScreener({}, { sql, now });
    assert.equal(heldRead.status, "data_hold"); assert.ok(heldRead.active.every(a => a.state === "data_hold" && !a.closed_at));
    now += 1000; frame = refresh(frame, now);
    assert.equal((await runStockScreener(deps)).events, 4, "resume is an update to each existing episode");
    const resumed = await readStockScreener({}, { sql, now });
    assert.equal(resumed.active.find(a => a.symbol === "NVDA")!.id, original.id);
    assert.deepEqual(resumed.active.find(a => a.symbol === "NVDA")!.reference, original.reference);
    assert.equal(resumed.active[0]!.version, 3);
    const stale = await readStockScreener({}, { sql, now: now + 130000 });
    assert.equal(stale.status, "data_hold"); assert.ok(stale.active.every(a => a.state === "data_hold"));
    now = Date.parse(original.expires_at); frame = refresh(frame, now);
    assert.equal((await runStockScreener(deps)).events, 4);
    const expired = await readStockScreener({}, { sql, now });
    assert.equal(expired.active.length, 0); assert.ok(expired.recent.every(a => a.state === "expired"));
  } finally { await sql.end(); process.env = saved; }
});
test("Postgres freezes first observations, scores closed setups and does not repair missed outcomes with backfills", { skip: !connection, timeout: 45000 }, async () => {
  const saved = { ...process.env }, sql = postgres(connection!, { prepare: false, max: 3, onnotice: () => {} });
  configure();
  let now = Date.parse("2026-11-25T16:00:00Z"), frame = stockFixture();
  const deps = { sql, now: () => now, fetchFrame: async () => frame, deliver: false };
  try {
    await sql.unsafe(STOCK_SCREENER_SCHEMA); await sql.unsafe(reset);
    await runStockScreener(deps);
    const initial = await readStockScreener({}, { sql, now }), reference = initial.active[0]!.reference;
    const issue = now;
    now += 15 * 60000 + 1000;
    for (const asset of Object.values(frame.instruments)) {
      const close = asset.symbol === "SPY" ? reference.benchmark_price : reference.price * 1.01;
      for (let minute = 0; minute < 15; minute++) asset.bars.push({ time: issue + minute * 60000, open: close, high: close, low: close, close, volume: 1000 });
      asset.quote = { time: now, bid: close * .9999, ask: close * 1.0001, bid_size: 10, ask_size: 10 };
    }
    frame = refresh(frame, now);
    await runStockScreener(deps);
    const scored = await readStockScreener({}, { sql, now });
    assert.equal(scored.evaluation.observed, 4); assert.equal(scored.evaluation.mean_cost_scenario_bps, null);
    assert.ok(scored.recent.every(a => a.outcomes[0]!.status === "observed" && a.state === "expired"));
    const originalClose = frame.instruments.NVDA!.bars.at(-1)!.close;
    frame.instruments.NVDA!.bars.at(-1)!.close *= 2;
    frame.instruments.NVDA!.bars.at(-1)!.high *= 2;
    now += 1000; refresh(frame, now); await runStockScreener(deps);
    const immutable = await sql.unsafe<Array<{ bar: { close: number } }>>("select bar from public.rarebird_stock_bars where symbol='NVDA' order by started_at desc limit 1");
    assert.equal(immutable[0]!.bar.close, originalClose);
    now = issue + 63 * 60000;
    refresh(frame, now); await runStockScreener(deps);
    const missed = await readStockScreener({}, { sql, now });
    assert.ok(missed.recent.every(a => a.outcomes[1]!.status === "missing"));
    // Old unsent notifications are discarded; they are still replayable through REST/MCP.
    let sends = 0;
    await deliverStockEvents(sql, { now: () => now, fetcher: async () => { sends++; return new Response(null, { status: 204 }); } });
    assert.equal(sends, 0);
  } finally { await sql.end(); process.env = saved; }
});

test("one setup is detected, delivered, updated, expired and measured through public replay", { skip: !connection, timeout: 45000 }, async () => {
  const saved = { ...process.env }, sql = postgres(connection!, { prepare: false, max: 3, onnotice: () => {} });
  configure();
  let now = Date.parse("2026-11-25T16:00:00Z");
  const issued = now, frame = stockFixture();
  for (const asset of Object.values(frame.instruments)) {
    if (!["NVDA", "SPY"].includes(asset.symbol)) asset.verified = false;
  }
  const deps = { sql, now: () => now, fetchFrame: async () => frame, deliver: false };
  const received = new Map<string, number>();
  let retryCreation = true;
  const receiver: typeof fetch = async (_url, init) => {
    const body = String(init!.body), headers = init!.headers as Record<string, string>;
    assert.equal(headers["X-Rarebird-Signature"], "v1=" + createHmac("sha256", process.env.RAREBIRD_STOCK_SCREENER_WEBHOOK_SECRET!)
      .update(`${headers["X-Rarebird-Timestamp"]}.${body}`).digest("hex"));
    const event = JSON.parse(body);
    assert.equal(event.alert.symbol, "NVDA");
    received.set(event.id, (received.get(event.id) ?? 0) + 1);
    if (event.type === "created" && retryCreation) { retryCreation = false; return new Response(null, { status: 503 }); }
    return new Response(null, { status: 204 });
  };
  try {
    await sql.unsafe(STOCK_SCREENER_SCHEMA); await sql.unsafe(reset);
    assert.equal((await runStockScreener(deps)).alerts, 1);
    const first = (await readStockScreener({}, { sql, now })).active[0]!;
    const query = { alert_id: first.id, after: "0", limit: 1 };
    await deliverStockEvents(sql, { now: () => now, fetcher: receiver });
    let page = await readStockScreener(query, { sql, now });
    assert.equal(page.event_delivery![0]!.status, "pending");
    now += 31000;
    await deliverStockEvents(sql, { now: () => now, fetcher: receiver });
    page = await readStockScreener(query, { sql, now });
    assert.equal(page.event_delivery![0]!.status, "delivered");
    assert.equal(page.event_delivery![0]!.attempts, 2);
    assert.ok(page.event_delivery![0]!.delivered_at);

    await runStockScreener({ ...deps, fetchFrame: async () => { throw new Error("stock_feed_unavailable"); } });
    await deliverStockEvents(sql, { now: () => now, fetcher: receiver });
    now += 1000; refresh(frame, now);
    await runStockScreener(deps);
    await deliverStockEvents(sql, { now: () => now, fetcher: receiver });

    for (const horizon of [15, 60]) {
      now = issued + horizon * 60000 + 1000;
      for (const asset of Object.values(frame.instruments)) {
        const close = asset.symbol === "SPY" ? first.reference.benchmark_price : first.reference.price * (horizon === 15 ? 1.01 : .99);
        asset.bars.push({ time: issued + (horizon - 1) * 60000, open: close, high: close, low: close, close, volume: 1000, observed_at: now });
      }
      refresh(frame, now);
      await runStockScreener(deps);
      await deliverStockEvents(sql, { now: () => now, fetcher: receiver });
    }
    const result = await readStockScreener({ alert_id: first.id, after: "0", limit: 50 }, { sql, now });
    assert.equal(result.active.length, 0);
    assert.equal(result.recent.length, 1);
    const final = result.recent[0]!;
    assert.equal(final.id, first.id);
    assert.deepEqual(final.reference, first.reference);
    assert.equal(final.state, "expired");
    assert.ok(final.outcomes.every(outcome => outcome.status === "observed"));
    assert.ok(final.outcomes[1]!.relative_return_bps! < 0, "unfavourable follow-through remains visible");
    assert.deepEqual(result.events.map(event => event.type), ["created", "data_hold", "updated", "measured", "expired", "measured"]);
    assert.deepEqual(result.events.map(event => event.alert.version), [1, 2, 3, 4, 5, 6]);
    assert.ok(result.event_delivery!.every(receipt => receipt.status === "delivered"));
    assert.equal(received.size, 6);
    assert.equal(result.evaluation.observed, 1);
    assert.equal(result.evaluation.mean_cost_scenario_bps, null);
    assert.equal(result.evaluation.cohort!.feed, "iex");
    const next = await readStockScreener({ ...query, after: page.next_cursor }, { sql, now });
    assert.equal(next.events[0]!.type, "data_hold", "filtered replay preserves event order and cursor");
    const absent = await readStockScreener({ alert_id: "stock_absent", after: "0" }, { sql, now });
    assert.equal(absent.recent.length, 0); assert.equal(absent.events.length, 0);
  } finally { await sql.end(); process.env = saved; }
});
