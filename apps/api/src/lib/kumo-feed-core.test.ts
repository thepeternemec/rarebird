import assert from "node:assert/strict";
import { test } from "node:test";
import { KumoFeedRecordSchema } from "@rarebird/contracts";
import { newsFeedRecord, interpretationFeedRecord, snapshotFeedRecords, sourceRecord } from "./kumo-feed-core.js";
import { quantitativeFixture } from "./quant-fixtures.js";

const first = "2026-11-25T12:00:00.000Z", later = "2026-11-25T12:05:00.000Z";
test("news availability uses both publication and first indexing, with a typed asset identity", () => {
  const record = newsFeedRecord({ id: "1", beat_id: "b_06c91290de1c", title: "Bitcoin ETF approvals",
    source: "Publisher", url: "https://example.com/report", published_at: first, first_indexed_at: later });
  assert.equal(record.available_at, later);
  assert.equal(record.asset_class, "crypto");
  assert.equal(record.categories.ticker, "BTC");
  assert.equal(record.text, "Bitcoin ETF approvals");
  assert.equal(newsFeedRecord({ id: "2", beat_id: record.entity_id, title: "Future publication",
    source: "P", url: record.source_url, published_at: later, first_indexed_at: first }).available_at, later);
});
test("interpretations use immutable revision availability and retain their evidence references", () => {
  const signal = quantitativeFixture(Date.parse(first)).signal;
  const record = interpretationFeedRecord(signal, later);
  assert.equal(record.available_at, later);
  assert.equal(record.categories.basis, "model_inference");
  assert.equal(record.categories.direction, "supportive");
  assert.ok(record.text.includes(signal.implications[0]!.mechanism));
  assert.deepEqual(record.related_ids, ["news:r1"]);
  assert.equal(record.values.probability, undefined);
});
test("a current sentiment snapshot cannot be backdated to its provider's historical date", () => {
  const records = snapshotFeedRecords("sentiment", { source: "alternative.me", source_url: "https://alternative.me",
    fetched_at: first, freshness: { status: "fresh" },
    data: { current: { value: 30, classification: "Fear", observed_at: "2026-11-24T12:00:00.000Z" } } }, later);
  assert.equal(records[0]!.available_at, later);
  assert.equal(records[0]!.event_at, "2026-11-24T12:00:00.000Z");
  assert.equal(records[0]!.values.change, null);
});
test("funding symbols join the crypto identity and stale readings never become context", () => {
  const payload = { source: "okx", source_url: "https://www.okx.com", fetched_at: first, freshness: { status: "fresh" },
    data: [{ symbol: "BTCUSDT", rate: .0001, annualised: .1, mark_price: 90000 }] };
  const record = snapshotFeedRecords("funding", payload, later)[0]!;
  assert.equal(record.entity_id, "b_06c91290de1c");
  assert.equal(record.values.open_interest, null);
  assert.deepEqual(snapshotFeedRecords("funding", { ...payload, freshness: { status: "stale" } }, later), []);
});
test("the common contract rejects invalid numbers and time windows", () => {
  const record = sourceRecord({ id: "test", kind: "tvl", entity: "macro:defi", source: "test",
    url: "https://example.com", eventAt: first, availableAt: later, ttl: 60000, values: { tvl: 10 } });
  assert.equal(KumoFeedRecordSchema.safeParse({ ...record, values: { tvl: NaN } }).success, false);
  assert.equal(KumoFeedRecordSchema.safeParse({ ...record, available_at: first, event_at: later }).success, false);
  assert.equal(KumoFeedRecordSchema.safeParse({ ...record, expires_at: record.available_at }).success, false);
});
