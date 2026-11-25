import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
function compile(path, stubs = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const module = { exports: {} };
  const scoped = id => id.endsWith(".css") ? {} : Object.hasOwn(stubs, id) ? stubs[id] : require(id);
  new Function("require", "module", "exports", outputText)(scoped, module, module.exports);
  return module.exports;
}
const snapshotModule = compile("../components/site/pilot-snapshot.ts");
const { summarizePilot, pilotCoverage } = snapshotModule;

// A current price feed does not establish that reporting analysis is available.
const now = Date.parse("2026-11-25T18:00:00Z");
const asset = { beat_id: "test", label: "Bitcoin", market: "current", analysis: "ready", source_freshness: "fresh" };
const brief = (coverage = [asset], extra = {}) => ({
  generated_at: new Date(now).toISOString(), status: "ready", coverage, review: [], watch: [], ...extra,
});

test("missing analysis is a data hold, not a clean scan with no candidates", () => {
  const view = summarizePilot(brief([{ ...asset, analysis: "unavailable" }]), now);
  assert.equal(view.branch, "none");
  assert.equal(view.title, "Signal analysis on hold");
  assert.match(view.notice, /Analysis is not ready for 1 of 1/);
  assert.match(view.coverage, /1 of 1 assets have current market data/);
});
test("partial reporting or market coverage qualifies an empty result", () => {
  for (const held of [{ ...asset, market: "held" }, { ...asset, analysis: "pending" }, { ...asset, source_freshness: "stale" }]) {
    const view = summarizePilot(brief([asset, held]), now);
    assert.equal(view.title, "Partial pilot coverage");
    assert.equal(view.branch, "none");
  }
});
test("a complete empty scan remains a valid no-candidates result", () => {
  const view = summarizePilot(brief(), now);
  assert.equal(view.title, "No qualifying candidates");
  assert.equal(view.notice, null);
});
test("a market hold remains distinct from an analysis hold", () => {
  const view = summarizePilot(brief([{ ...asset, market: "held", analysis: "unavailable" }]), now);
  assert.equal(view.title, "Market data on hold");
  assert.match(view.notice, /Analysis is not ready/);
});
test("expired reviews never produce a current review state", () => {
  const review = { label: "Bitcoin", market_evidence_until: new Date(now - 1).toISOString() };
  assert.equal(summarizePilot(brief([asset], { review: [review] }), now).branch, "none");
  const current = { ...review, market_evidence_until: new Date(now + 60_000).toISOString() };
  assert.equal(summarizePilot(brief([asset], { review: [current] }), now).branch, "review");
});
test("an independent anomaly watch can coexist with held reporting analysis", () => {
  const watch = { label: "Bitcoin", minutes: 30, historical_windows: 40 };
  const view = summarizePilot(brief([{ ...asset, analysis: "unavailable" }], { watch: [watch] }), now);
  assert.equal(view.branch, "watch");
  assert.match(view.title, /Keep watching/);
  assert.match(view.notice, /Analysis is not ready/);
});
test("malformed responses fail clearly instead of inventing an empty market result", () => {
  for (const payload of [null, {}, brief([]), brief([asset], { generated_at: "invalid" })]) {
    assert.throws(() => summarizePilot(payload, now), /Pilot snapshot is invalid/);
  }
});

test("the full pilot view distinguishes available prices from review-ready coverage", () => {
  const missing = pilotCoverage([{ ...asset, analysis: "unavailable" }]);
  assert.equal(missing.current, 1);
  assert.equal(missing.complete, 0);
  assert.match(missing.notice, /Analysis is not ready/);
  assert.equal(pilotCoverage([asset]).complete, 1);
  assert.equal(pilotCoverage([]).current, 0);
});

// The primary action stays a real link, independent of animation or market requests.
const stockSnapshotModule = compile("../components/site/stock-pilot-snapshot.ts");
const activityDemo = compile("../components/site/stock-activity-demo.ts");
const StockScreeningActivity = compile("../components/site/signal-graph.tsx", {
  "./stock-activity-demo": activityDemo,
}).default;
test("the activity illustration links directly to the stock screener and cannot look like live data", () => {
  const html = renderToStaticMarkup(createElement(StockScreeningActivity));
  assert.match(html, /<a[^>]*href="\/app\/screener"[^>]*>Open stock screener/);
  assert.match(html, /Illustrative example/);
  assert.match(html, /class="rb-signal-matrix" aria-hidden="true"/);
  assert.match(html, /data-playing="false"/, "the server-rendered fallback is static");
  assert.match(html, /aria-label="How stock screening works"/);
});


const stockFeed = (extra = {}) => ({
  generated_at: new Date(now).toISOString(), status: "monitoring", message: "Screening",
  universe: ["NVDA", "AAPL", "MSFT", "GOOGL"].map(symbol => ({ symbol })),
  coverage: ["NVDA", "AAPL", "MSFT", "GOOGL"].map(symbol => ({ symbol, state: "quiet" })),
  active: [], source: { last_scan_at: new Date(now).toISOString() }, delivery: { configured: false }, ...extra,
});
test("stock landing distinguishes an unconnected feed from a complete quiet scan", () => {
  const { summarizeStockPilot } = stockSnapshotModule;
  const missing = summarizeStockPilot(stockFeed({ status: "not_configured", coverage: [], source: { last_scan_at: null } }), now);
  assert.equal(missing.title, "Stock feed connection pending"); assert.equal(missing.branch, "none");
  const quiet = summarizeStockPilot(stockFeed(), now);
  assert.equal(quiet.title, "No qualifying stock setup"); assert.equal(quiet.branch, "watch");
  assert.match(quiet.notice, /webhook is not configured/);
  assert.equal(summarizeStockPilot(stockFeed({ coverage: [{ state: "data_hold" }] }), now).title, "Partial stock coverage");
});
test("stock landing never promotes stale scans or expired setups into an agent alert", () => {
  const { summarizeStockPilot } = stockSnapshotModule;
  const active = { symbol: "NVDA", state: "active", closed_at: null, valid_until: new Date(now + 60000).toISOString(), expires_at: new Date(now + 900000).toISOString() };
  assert.equal(summarizeStockPilot(stockFeed({ active: [active] }), now).branch, "review");
  const old = stockFeed({ active: [active], source: { last_scan_at: new Date(now - 91000).toISOString() } });
  assert.equal(summarizeStockPilot(old, now).branch, "none");
  assert.equal(summarizeStockPilot(stockFeed({ active: [{ ...active, valid_until: new Date(now - 1).toISOString() }] }), now).branch, "watch");
  assert.equal(summarizeStockPilot(stockFeed({ status: "market_closed" }), now).title, "US regular market closed");
  assert.equal(summarizeStockPilot(stockFeed({ status: "warming_up" }), now).title, "Building today’s stock baseline");
  for (const payload of [null, {}, stockFeed({ generated_at: "invalid" })]) assert.throws(() => summarizeStockPilot(payload, now), /Stock pilot snapshot is invalid/);
});
