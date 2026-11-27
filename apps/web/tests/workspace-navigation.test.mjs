import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import * as contracts from "@rarebird/contracts";

const require = createRequire(import.meta.url);
function load(path, overrides = {}) {
  const url = new URL(path, new URL("../", import.meta.url));
  const source = readFileSync(url, "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } });
  const module = { exports: {} };
  new Function("module", "exports", "require", outputText)(module, module.exports, name => {
    if (name in overrides) return overrides[name];
    if (name === "@rarebird/contracts") return contracts;
    if (name.endsWith(".css")) return {};
    if (name.startsWith("@/lib/")) return load("lib/" + name.slice(6) + ".ts", overrides);
    if (name.startsWith("./")) return load("lib/" + name.slice(2) + ".ts", overrides);
    return require(name);
  });
  return module.exports;
}
const links = load("lib/workspace-links.ts");
const selection = load("lib/workspace-selection.ts");
const legacy = load("lib/legacy-market-link.ts");
const navigation = load("lib/navigation.ts");

test("research navigation stays in research instead of returning to the screener", () => {
  assert.equal(links.workspaceMarketHref("equity"), "/app/research");
  assert.equal(links.workspaceMarketHref("crypto"), "/app/research?market=crypto");
  assert.equal(links.workspaceAssetHref("b_bb964843350e"), "/app/research?beat=b_bb964843350e");
  assert.equal(links.workspaceCoinHref("bitcoin"), "/app/research?coin=bitcoin");
  const search = new URL(links.workspaceSearchHref("SUI & partners", "crypto"), "https://example.com");
  assert.equal(search.pathname, "/app/research");
  assert.equal(search.searchParams.get("q"), "SUI & partners");
  assert.equal(search.searchParams.get("market"), "crypto");
});

test("old research bookmarks retain their identity and filters; tracking parameters do not change app mode", () => {
  assert.equal(links.legacyResearchHref({}), null);
  assert.equal(links.legacyResearchHref({ utm_source: "newsletter" }), null);
  const href = links.legacyResearchHref({ beat: "b_bb964843350e", market: "equity", q: "NVIDIA", tag: ["a", "b"] });
  const url = new URL(href, "https://example.com");
  assert.equal(url.pathname, "/app/research");
  assert.equal(url.searchParams.get("beat"), "b_bb964843350e");
  assert.equal(url.searchParams.get("q"), "NVIDIA");
  assert.deepEqual(url.searchParams.getAll("tag"), ["a", "b"]);
});

test("legacy market and ticker destinations resolve to the new research route", () => {
  assert.equal(legacy.legacyMarketDestination(null, "equity"), "/app/research");
  assert.equal(legacy.legacyMarketDestination(null, "crypto"), "/app/research?market=crypto");
  assert.equal(legacy.legacyMarketDestination("b_bb964843350e", "crypto"), "/app/research?beat=b_bb964843350e");
  assert.equal(selection.tickerWorkspaceHref({ ticker: "NVDA" }, "#brief"), "/app/research?beat=b_bb964843350e#brief");
  // SUI is shared by a stock and a coin. Retain the query rather than choosing an identity.
  assert.equal(selection.tickerWorkspaceHref({ ticker: "SUI" }), "/app/research?q=SUI");
});

test("app entry stays on setups and redirects only recognized research selections", async () => {
  const page = load("app/(site)/app/page.tsx", {
    "next/navigation": { redirect: href => { throw new Error("redirect:" + href); } },
    "@/components/site/workspace-shell": { default: "workspace-shell" },
    "@/components/site/stock-screener": { default: "stock-screener" },
  });
  const app = await page.default({ searchParams: Promise.resolve({ utm_source: "newsletter" }) });
  assert.equal(app.props.active, "/app/screener");
  await assert.rejects(page.default({ searchParams: Promise.resolve({ market: "equity" }) }), /redirect:\/app\/research\?market=equity/);
});

test("desktop, mobile and footer destinations are distinct current pages", () => {
  assert.equal(navigation.SCREENER_HREF, "/app/screener");
  assert.equal(navigation.RESEARCH_HREF, "/app/research");
  const hrefs = navigation.NAVIGATION_LINKS.map(link => link.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
  assert.ok(hrefs.includes("/docs/quickstart"));
  assert.ok(hrefs.includes("/status"));
  assert.ok(!hrefs.some(href => ["/app", "/ask", "/dashboard", "/tokens", "/app/forecasts"].includes(href)));
});
