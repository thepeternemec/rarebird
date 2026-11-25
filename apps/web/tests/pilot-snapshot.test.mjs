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

// The main action must navigate without waiting for a snapshot fetch or JavaScript.
const SignalGraph = compile("../components/site/signal-graph.tsx", {
  "./signal-graph-scene": { default: () => null },
  "./pilot-snapshot": snapshotModule,
}).default;
test("Check live pilot is a direct link; the optional preview is a separate control", () => {
  const html = renderToStaticMarkup(createElement(SignalGraph));
  assert.match(html, /<a[^>]*href="\/app#opportunities"[^>]*>Check live pilot/);
  assert.match(html, /<button[^>]*aria-controls="[^"]+-pilot-status"[^>]*>[\s\S]*?Preview snapshot<\/button>/);
  assert.ok(!/<button[^>]*>Check live pilot/.test(html));
});
