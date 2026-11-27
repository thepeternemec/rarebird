import assert from "node:assert/strict";
import { test } from "node:test";
import { stockActivation } from "../../../scripts/stock-activation.mjs";

const now = Date.parse("2026-11-27T16:00:00Z");
function connected() {
  return [{ status: "warming_up", universe: [{ symbol: "NVDA" }], universe_snapshot: { id: "snapshot" },
    source: { feed: "iex", mode: "scheduled", last_scan_at: new Date(now).toISOString() },
    delivery: { configured: true, delivered: 0, pending: 0, failed: 0 } },
  { universe_version: "snapshot", feed: "iex", data_status: "available", model: { worker: { state: "warming_up", last_seen_at: new Date(now).toISOString() },
    issued: 0, observed: 0, missing: 0 } }];
}
test("activation permits honest warmup and does not manufacture a delivery acknowledgement", () => {
  const result = stockActivation(...connected(), now);
  assert.equal(result.ready, true);
  assert.equal(result.checks.delivery.acknowledged, 0);
  assert.equal(result.predictions.issued, 0);
});
test("activation rejects disconnected, held, stale and mismatched services", () => {
  for (const change of [
    ([screen]) => { screen.status = "not_configured"; },
    ([screen]) => { screen.status = "data_hold"; },
    ([screen]) => { screen.delivery.configured = false; },
    ([screen]) => { screen.source.last_scan_at = new Date(now-100000).toISOString(); },
    ([, model]) => { model.model.worker.last_seen_at = new Date(now-190000).toISOString(); },
    ([, model]) => { model.model.worker.state = "degraded"; },
    ([, model]) => { model.feed = "sip"; },
    ([, model]) => { model.universe_version = "different"; },
  ]) {
    const data = connected(); change(data);
    assert.equal(stockActivation(...data, now).ready, false);
  }
});
