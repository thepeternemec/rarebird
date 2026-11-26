import assert from "node:assert/strict";
import { test } from "node:test";
import type { StockAlert } from "@rarebird/contracts";
import { evolveStockAlert, screenStock, settleStockOutcomes, stockSession } from "./stock-screener-engine.js";
import { stockFixture } from "./stock-screener-fixtures.js";
import { visibleStockAlert } from "./stock-screener-store.js";

const now = Date.parse("2026-11-25T16:00:00Z");
const start = () => evolveStockAlert(null, screenStock(stockFixture(), "NVDA", now), now, "iex", "stock_test").alert!;
test("US-share screen finds developing strength using a strictly pre-window baseline", () => {
  const result = screenStock(stockFixture(), "NVDA", now);
  assert.equal(result.state, "candidate", JSON.stringify(result));
  assert.ok(result.metrics!.relative_return_bps > 25);
  assert.ok(result.metrics!.residual_z > 2.5 && result.metrics!.residual_z < 6);
  assert.equal(result.metrics!.relative_volume, 3);
  assert.equal(result.metrics!.baseline_samples, 60);
  assert.equal(Date.parse(result.metrics!.baseline_end_at), now - 5 * 60000);
  assert.equal(screenStock(stockFixture(0), "NVDA", now).state, "quiet", "a market-following stock is not a relative setup");
  assert.equal(screenStock(stockFixture(0.002), "NVDA", now).state, "extended", "already large moves do not create fresh setups");
});
test("missing or malformed data, stale quotes and token identities cannot create a stock setup", () => {
  const cases = [
    (f: ReturnType<typeof stockFixture>) => { f.instruments.NVDA!.quote!.time -= 31000; },
    (f: ReturnType<typeof stockFixture>) => { f.instruments.SPY!.quote!.ask = 0; },
    (f: ReturnType<typeof stockFixture>) => { f.instruments.NVDA!.verified = false; },
    (f: ReturnType<typeof stockFixture>) => { f.instruments.NVDA!.symbol = "NVDAx"; },
    (f: ReturnType<typeof stockFixture>) => { f.instruments.NVDA!.bars[10]!.close = NaN; },
    (f: ReturnType<typeof stockFixture>) => { f.instruments.SPY!.bars.splice(20, 1); },
    (f: ReturnType<typeof stockFixture>) => { f.received_at = new Date(now - 91000).toISOString(); },
    (f: ReturnType<typeof stockFixture>) => { f.session_checked_at = new Date(now + 6000).toISOString(); },
    (f: ReturnType<typeof stockFixture>) => { f.instruments.NVDA!.quote!.ask *= 1.01; },
    (f: ReturnType<typeof stockFixture>) => { f.instruments.NVDA!.bars.push({ ...f.instruments.NVDA!.bars[0]!, time: now + 60000 }); },
  ];
  for (const change of cases) { const frame = stockFixture(); change(frame); assert.equal(screenStock(frame, "NVDA", now).state, "data_hold"); }
  const closed = stockFixture(); closed.session_open = false;
  assert.equal(screenStock(closed, "NVDA", now).state, "data_hold");
  const warming = stockFixture(); for (const a of Object.values(warming.instruments)) a.bars = a.bars.slice(-20);
  assert.equal(screenStock(warming, "NVDA", now).state, "warming_up");
  for (const a of Object.values(warming.instruments)) a.bars = a.bars.slice(0, -3);
  assert.equal(screenStock(warming, "NVDA", now).state, "data_hold", "a short baseline cannot conceal stale last bars");
  assert.equal(stockSession(Date.parse("2026-11-25T14:30Z")).minute, 570);
  assert.equal(stockSession(Date.parse("2026-07-01T13:30Z")).minute, 570, "New York daylight saving is respected");
});
test("one episode keeps its identity, reference and evaluation schedule; holds resume without duplicate creations", () => {
  const screen = screenStock(stockFixture(), "NVDA", now), first = start();
  let previous = first;
  for (let i = 1; i < 5; i++) {
    const next = evolveStockAlert(previous, { ...screen, metrics: { ...screen.metrics!, price: 150 + i } }, now + i * 60000, "iex", "another_id");
    assert.equal(next.type, null); assert.equal(next.alert!.id, first.id);
    assert.deepEqual(next.alert!.reference, first.reference); assert.deepEqual(next.alert!.outcomes, first.outcomes);
    previous = next.alert!;
  }
  const held = evolveStockAlert(previous, { ...screen, state: "data_hold", metrics: null }, now + 5 * 60000, "iex", "x");
  assert.equal(held.type, "data_hold"); assert.equal(held.alert!.closed_at, null);
  assert.equal(evolveStockAlert(held.alert, { ...screen, state: "data_hold" }, now + 6 * 60000, "iex", "x").type, null);
  const resumed = evolveStockAlert(held.alert, screen, now + 7 * 60000, "iex", "x");
  assert.equal(resumed.type, "updated"); assert.equal(resumed.alert!.id, first.id);
  assert.equal(resumed.alert!.version, 3);
  const invalidated = evolveStockAlert(resumed.alert, { ...screen, state: "quiet" }, now + 8 * 60000, "iex", "x");
  assert.equal(invalidated.type, "invalidated");
  assert.equal(evolveStockAlert(invalidated.alert, screen, now + 9 * 60000, "iex", "new").type, null, "cooldown prevents repeated same-move alerts");
  assert.equal(evolveStockAlert(invalidated.alert, screen, now + 30 * 60000, "iex", "new").type, "created");
  assert.equal(evolveStockAlert(first, { ...screen, state: "data_hold" }, now + 15 * 60000, "iex", "x").type, "expired", "even a data hold has a bounded lifetime");
  assert.equal(visibleStockAlert(first, now + 120001).state, "data_hold");
  assert.equal(visibleStockAlert(first, now + 15 * 60000).state, "expired", "public reads cannot show a stale worker as an active setup");
});
test("forward outcomes exclude future bars, late backfills and mismatched feeds; frozen cost assumptions are explicit", () => {
  const first = start(), due = now + 15 * 60000, frame = stockFixture();
  for (const a of Object.values(frame.instruments)) {
    const close = a.symbol === "SPY" ? first.reference.benchmark_price : first.reference.price * 1.01;
    a.bars.push({ time: due - 60000, open: close, high: close, low: close, close, volume: 100, observed_at: due + 1000 });
  }
  assert.equal(settleStockOutcomes(first, frame, due - 1).outcomes[0]!.status, "pending");
  const observed = settleStockOutcomes(first, frame, due + 2000);
  assert.equal(observed.outcomes[0]!.status, "observed");
  assert.equal(observed.outcomes[0]!.asset_return_bps, 100);
  assert.equal(observed.outcomes[1]!.status, "pending");
  assert.ok(Math.abs(observed.outcomes[0]!.relative_return_bps! - observed.outcomes[0]!.cost_scenario_bps! - 22) < 0.001);
  assert.deepEqual(observed.reference, first.reference);
  assert.deepEqual(settleStockOutcomes(first, { ...frame, feed: "sip" }, due + 2000), first);
  for (const a of Object.values(frame.instruments)) a.bars.at(-1)!.observed_at = due + 180000;
  assert.equal(settleStockOutcomes(first, frame, due + 180000).outcomes[0]!.status, "missing", "recovered historical data cannot repair a missed observation");
  const inactive: StockAlert = { ...first, state: "invalidated", closed_at: new Date(now + 60000).toISOString() };
  assert.equal(settleStockOutcomes(inactive, frame, due + 180000).outcomes[0]!.status, "missing", "failed setups remain in the measurement cohort");
});

test("continuing setups publish bounded updates only for fresh measurement windows", () => {
  const first = start(), screen = screenStock(stockFixture(), "NVDA", now);
  const unchanged = evolveStockAlert(first, screen, now + 5 * 60000, "iex", "unused");
  assert.equal(unchanged.type, null, "old measurements do not produce a heartbeat");
  const fresh = { ...screen, metrics: { ...screen.metrics!, measured_at: new Date(now + 5 * 60000).toISOString() } };
  const update = evolveStockAlert(first, fresh, now + 5 * 60000, "iex", "unused");
  assert.equal(update.type, "updated");
  assert.equal(update.alert!.version, 2);
  assert.equal(update.alert!.id, first.id);
  assert.deepEqual(update.alert!.reference, first.reference);
  assert.equal(evolveStockAlert(update.alert, fresh, now + 6 * 60000, "iex", "unused").type, null);
});
