import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { closeDb, db } from "@rarebird/db";
import { runKumoFeedCollection } from "./kumo-feed-store.js";
import { readKumoFeedPage } from "./kumo-feeds.js";

const connection = process.env.RAREBIRD_INTELLIGENCE_TEST_DATABASE_URL;
if (connection) {
  const url = new URL(connection);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/rarebird_intelligence_test")
    throw new Error("Kumo feed tests require the dedicated localhost database.");
}
test("the durable feed journal preserves first availability and isolates failed sources", { skip: !connection, timeout: 45000 }, async () => {
  process.env.DATABASE_URL = connection!;
  const sql = db(), at = new Date(Date.now() - 60000).toISOString();
  const payload = { source: "okx", source_url: "https://www.okx.com", fetched_at: at, freshness: { status: "fresh" },
    data: [{ symbol: "BTCUSDT", rate: .0001, annualised: .1, mark_price: 90000 }] };
  try {
    await sql.unsafe(readFileSync(new URL("../../../../db/schema.sql", import.meta.url), "utf8"));
    await sql.unsafe("truncate public.newsbeat_kumo_feed_records,public.newsbeat_kumo_feed_health,public.newsbeat_kumo_feed_worker,public.newsbeat_official_evidence,public.newsbeat_market_sources");
    await runKumoFeedCollection([{ kind: "funding", fetch: async () => payload }]);
    const stored = await sql.unsafe<Array<{ type: string }>>("select jsonb_typeof(record) as type from public.newsbeat_kumo_feed_records where kind='funding'");
    assert.equal(stored[0]!.type, "object");
    const first = await readKumoFeedPage({ kind: "funding" });
    assert.equal(first.records.length, 1);
    await runKumoFeedCollection([{ kind: "funding", fetch: async () => payload }, { kind: "sentiment", fetch: async () => { throw new Error("outage"); } }]);
    const repeated = await readKumoFeedPage({ kind: "funding" });
    assert.deepEqual(repeated.records, first.records);
    assert.equal((await readKumoFeedPage({ kind: "sentiment" })).coverage.error, "source_unavailable");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("Public export must not fetch"); };
    try { assert.equal((await readKumoFeedPage({ kind: "funding" })).records.length, 1); }
    finally { globalThis.fetch = originalFetch; }
    await sql.unsafe("update public.newsbeat_kumo_feed_worker set token='other',lease_until=now()+interval '1 minute' where id='feeds'");
    assert.equal((await runKumoFeedCollection([{ kind: "funding", fetch: async () => { throw new Error("Must not fetch a leased job"); } }])).status, "leased");
  } finally { await closeDb(); }
});
test("feed pagination freezes its window and handles identical timestamps without duplicates", { skip: !connection, timeout: 45000 }, async () => {
  process.env.DATABASE_URL = connection!;
  const sql = db(), at = new Date(Date.now() - 60000).toISOString();
  try {
    await sql.unsafe(readFileSync(new URL("../../../../db/schema.sql", import.meta.url), "utf8"));
    await sql.unsafe("truncate public.news_articles restart identity");
    for (let i = 0; i < 3; i++) await sql.unsafe("insert into public.news_articles(beat_id,provider_uri,title,excerpt,url,source,published_at,first_indexed_at) values('b_06c91290de1c',$1,'Bitcoin test','',$2,'kumo-pagination-test',$3,$3)", [String(i), "https://example.com/kumo/" + i, at.slice(0, -1) + "123Z"]);
    const since = new Date(Date.parse(at) - 1000).toISOString();
    const first = await readKumoFeedPage({ kind: "news", since, limit: 1 });
    assert.ok(first.next_cursor);
    const second = await readKumoFeedPage({ kind: "news", limit: 1, cursor: first.next_cursor! });
    const third = await readKumoFeedPage({ kind: "news", limit: 1, cursor: second.next_cursor! });
    assert.equal(third.next_cursor, null);
    assert.equal(new Set([...first.records, ...second.records, ...third.records].map(r => r.id)).size, 3);
    assert.equal(first.until, third.until);
    await assert.rejects(readKumoFeedPage({ kind: "funding", cursor: first.next_cursor! }), /invalid_feed_window/);
    await assert.rejects(readKumoFeedPage({ kind: "news", cursor: "bad" }), /invalid_feed_cursor/);
  } finally { await closeDb(); }
});


test("hourly feed sampling retains older training context and later arrivals cannot replace it", { skip: !connection, timeout: 45000 }, async () => {
  process.env.DATABASE_URL = connection!;
  const sql = db(), hour = Math.floor(Date.now() / 3600000) * 3600000 - 2 * 3600000;
  const at = (minutes: number) => new Date(hour + minutes * 60000).toISOString();
  try {
    await sql.unsafe(readFileSync(new URL("../../../../db/schema.sql", import.meta.url), "utf8"));
    await sql.unsafe("truncate public.news_articles restart identity");
    const add = async (i: number, minute: number) => sql.unsafe("insert into public.news_articles(beat_id,provider_uri,title,excerpt,url,source,published_at,first_indexed_at) values('b_06c91290de1c',$1,'Bitcoin hourly sample','',$2,'kumo-hourly-test',$3,$3)", [String(i), "https://example.com/hourly/" + i, at(minute)]);
    await add(1, 1); await add(2, 2);
    const original = await readKumoFeedPage({ kind: "news", sampling: "hourly", since: at(-60), until: at(3) });
    await add(3, 10); await add(4, 20);
    const later = await readKumoFeedPage({ kind: "news", sampling: "hourly", since: at(-60), until: at(30) });
    assert.deepEqual(later.records, original.records, "a later observation cannot displace information known at an earlier forecast");
    assert.equal(later.coverage.sampling, "hourly");
    assert.equal((await readKumoFeedPage({ kind: "news", since: at(-60), until: at(30) })).records.length, 4);
    const first = await readKumoFeedPage({ kind: "news", sampling: "hourly", since: at(-60), until: at(30), limit: 1 });
    await assert.rejects(readKumoFeedPage({ kind: "news", sampling: "all", cursor: first.next_cursor! }), /invalid_feed_window/);
  } finally { await closeDb(); }
});


test("short-lived hourly samples retain a fresh reading for the next forecast", { skip: !connection, timeout: 45000 }, async () => {
  process.env.DATABASE_URL = connection!;
  const sql = db(), hour = Math.floor(Date.now() / 3600000) * 3600000 - 2 * 3600000;
  const at = (minutes: number) => new Date(hour + minutes * 60000).toISOString();
  try {
    await sql.unsafe(readFileSync(new URL("../../../../db/schema.sql", import.meta.url), "utf8"));
    await sql.unsafe("truncate public.newsbeat_kumo_feed_records,public.newsbeat_kumo_feed_health");
    for (const minute of [2, 52]) {
      const record = { id: "chain:sample:" + minute, kind: "chain", entity_id: "chain:ethereum", asset_class: "chain",
        source: "test", source_url: "https://example.com", event_at: at(minute), available_at: at(minute),
        expires_at: at(minute + 20), text: "", values: { block: minute }, categories: {}, related_ids: [] };
      await sql.unsafe("insert into public.newsbeat_kumo_feed_records(id,kind,available_at,record) values($1,'chain',$2,$3::jsonb)", [record.id, record.available_at, JSON.stringify(record)]);
    }
    const page = await readKumoFeedPage({ kind: "chain", sampling: "hourly", since: at(0), until: at(61) });
    assert.deepEqual(page.records.map(r => r.values.block), [52]);
    assert.ok(Date.parse(page.records[0]!.available_at) <= Date.parse(at(61)));
    assert.ok(Date.parse(page.records[0]!.expires_at) > Date.parse(at(61)));
    assert.equal((await readKumoFeedPage({ kind: "chain", since: at(0), until: at(61) })).records.length, 2);
  } finally { await closeDb(); }
});


test("hourly journal sampling normalizes legacy JSON strings and groups by the real entity", { skip: !connection, timeout: 45000 }, async () => {
  process.env.DATABASE_URL = connection!;
  const sql = db(), hour = Math.floor(Date.now() / 3600000) * 3600000 - 2 * 3600000;
  const at = (minutes: number) => new Date(hour + minutes * 60000).toISOString();
  try {
    await sql.unsafe(readFileSync(new URL("../../../../db/schema.sql", import.meta.url), "utf8"));
    await sql.unsafe("truncate public.newsbeat_kumo_feed_records,public.newsbeat_kumo_feed_health");
    for (const minute of [5, 15]) {
      const record = { id: "funding:" + minute, kind: "funding", entity_id: "b_06c91290de1c", asset_class: "crypto",
        source: "test", source_url: "https://example.com", event_at: at(minute), available_at: at(minute),
        expires_at: at(minute + 60), text: "", values: { rate: minute }, categories: {}, related_ids: [] };
      const parameter = minute === 5 ? JSON.stringify(record) : record as never;
      await sql.unsafe("insert into public.newsbeat_kumo_feed_records(id,kind,available_at,record) values($1,'funding',$2,$3::jsonb)", [record.id, record.available_at, parameter]);
    }
    const types = await sql.unsafe<Array<{ type: string }>>("select jsonb_typeof(record) as type from public.newsbeat_kumo_feed_records order by available_at");
    assert.deepEqual(types.map(r => r.type), ["string", "object"]);
    const page = await readKumoFeedPage({ kind: "funding", sampling: "hourly", since: at(0), until: at(30) });
    assert.deepEqual(page.records.map(r => r.values.rate), [5]);
    assert.equal((await readKumoFeedPage({ kind: "funding", since: at(0), until: at(30) })).records.length, 2);
  } finally { await closeDb(); }
});
