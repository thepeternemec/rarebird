import assert from "node:assert/strict";

const origin = "https://www.rarebird.network";
const nvda = "b_bb964843350e";
const btc = "b_06c91290de1c";
const mint = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const token = "solana:" + mint;
const goodUrl = value => typeof value === "string" && /^https:\/\//.test(value);
const validTime = value => typeof value === "string" && Number.isFinite(Date.parse(value));

async function request(path, body) {
  const headers = { "X-Rarebird-Traffic": "synthetic", Accept: "application/json" };
  if (body) headers["Content-Type"] = "application/json";
  const response = await fetch(origin + path, {
    method: body ? "POST" : "GET", headers, signal: AbortSignal.timeout(12000),
    ...(body && { body: JSON.stringify(body) }),
  });
  assert.equal(response.status, 200, path + " HTTP status");
  return response.json();
}

function checkFreshness(data, field = "freshness") {
  assert.ok(["fresh", "stale", "unavailable"].includes(data?.[field]?.status), "freshness status");
  return data[field].status === "fresh" ? undefined : data[field].status;
}

function sourced(data) {
  if (data?.freshness?.status !== "unavailable") {
    assert.ok(goodUrl(data.source_url), "source link");
    assert.ok(validTime(data.fetched_at), "source fetch time");
    assert.ok(data.data, "source data");
  }
  return checkFreshness(data);
}

function quote(data, id) {
  const asset = data.data.assets.find(item => item.id === id);
  assert.ok(asset && asset.price_usd > 0 && validTime(asset.observed_at), id + " attributed quote");
}

function combineParts(data, keys) {
  const unavailable = keys.flatMap(key => {
    const status = sourced(data[key]);
    return status ? [key + " " + status] : [];
  });
  return unavailable.join(", ") || undefined;
}

const cases = [
  ["Service health", "/api/health", data => { assert.equal(data.ok, true); }],
  ["Status monitor", "/api/status", data => {
    assert.ok(Array.isArray(data.latest?.components) && data.latest.components.length >= 3);
    return data.monitoring === "current" && data.status === "operational" ? undefined : data.monitoring + " / " + data.status;
  }],
  ["Ticker autocomplete", "/api/v2/topics?q=nv&view=identity&limit=6", data => {
    assert.ok(data.topics.some(item => item.beat_id === nvda && item.ticker === "NVDA" && item.asset === "equity"));
  }],
  ["Stock listing lookup", "/api/quote-symbols?beats=" + nvda, data => { assert.equal(data.symbols[nvda], "NASDAQ:NVDA"); }],
  ...["equity", "crypto"].map(asset => ["Discovery " + asset, "/api/v2/discovery?asset=" + asset + "&limit=3", data => {
    assert.ok(validTime(data.coverage.scanned_at) && Array.isArray(data.events));
    assert.ok(data.events.every(item => item.assets.some(entry => entry.asset === asset)
      && item.evidence.length && item.evidence.every(entry => goodUrl(entry.url))));
    return data.status === "ready" ? undefined : data.status + " coverage";
  }]),
  ["Grouped stories", "/api/v2/stories?beat_id=" + nvda + "&limit=20", data => {
    assert.ok(Array.isArray(data.stories) && data.stories.every(item => goodUrl(item.lead_article.url)));
    return checkFreshness(data);
  }],
  ["News and cursor", "/api/v2/news?beat_id=" + nvda, async data => {
    assert.ok(Array.isArray(data.items) && data.items.every(item => item.beat_id === nvda && goodUrl(item.url)));
    assert.ok(typeof data.cursor === "string" && data.cursor.length > 0);
    const changes = await request("/api/v2/changes?beat_id=" + nvda + "&cursor=" + encodeURIComponent(data.cursor));
    assert.ok(Array.isArray(changes.items) && changes.items.every(item => item.beat_id === nvda));
    return checkFreshness(data);
  }],
  ["Crypto market board", "/api/v2/markets", data => {
    quote(data, "bitcoin");
    assert.ok(Array.isArray(data.data.assets.find(asset => asset.id === "bitcoin").sparkline_7d));
    return sourced(data) ?? (data.data.coverage === "market_cap_ranked" ? undefined : "tracked basket fallback");
  }],
  ["Crypto prices", "/api/v2/prices?ids=bitcoin,ethereum", data => {
    quote(data, "bitcoin"); quote(data, "ethereum"); return sourced(data);
  }],
  ["Market overview", "/api/v2/market", data => combineParts(data, ["fear_greed", "tvl", "prices"])],
  ["Crypto sentiment", "/api/v2/sentiment?limit=2", data => {
    assert.ok(Number.isFinite(data.data.current.value)); return sourced(data);
  }],
  ["Crypto indicators", "/api/v2/signals", data => combineParts(data, ["funding", "dex_volume", "stablecoins"])],
  ["Chain activity", "/api/v2/chain", data => {
    assert.ok(Number.isFinite(data.data.ethereum?.block) || Number.isFinite(data.data.solana?.slot));
    return sourced(data) ?? (!data.data.ethereum ? "Ethereum reading unavailable" : !data.data.solana ? "Solana reading unavailable" : undefined);
  }],
  ["Token contract lookup", "/api/v2/tokens?asset=" + encodeURIComponent(token), data => {
    assert.equal(data.asset.chain, "solana"); assert.equal(data.asset.address, mint);
    assert.equal(data.registry?.ticker, "NVDA"); assert.equal(data.underlying_news?.beat_id, nvda);
    assert.ok(Array.isArray(data.market.pools) && data.market.pools.every(pool => goodUrl(pool.url)));
    return data.market.status !== "fresh" ? data.market.status : data.underlying_news.status === "fresh" ? undefined : "company news " + data.underlying_news.status;
  }],
  ["SEC filings", "/api/v2/catalysts?beat_id=" + nvda, data => {
    assert.deepEqual(data.coverage.map(item => item.beat_id), [nvda]);
    const filings = data.coverage[0].snapshot?.filings ?? [];
    assert.ok(filings.every(item => new URL(item.url).origin === "https://www.sec.gov" && validTime(item.accepted_at)));
    return data.coverage[0].status === "fresh" && filings.length ? undefined : data.coverage[0].status + " filing snapshot";
  }],
  ["Scoped reviews", "/api/v2/opportunities?beat_id=" + nvda, data => {
    assert.deepEqual(data.coverage.map(item => item.beat_id), [nvda]);
    assert.ok(data.review.every(item => item.beat_id === nvda) && data.watch.every(item => item.beat_id === nvda));
    return data.status === "ready" ? undefined : data.status + " market evidence";
  }],
  ["Asset market evidence", "/api/v2/intelligence?beat_id=" + nvda, data => {
    assert.equal(data.beat_id, nvda); assert.equal(data.context.id, "fundamentals");
    assert.ok(Array.isArray(data.signals) && data.quantitative?.market?.instrument?.venue === "kraken");
    return data.analysis?.error ?? (data.status === "ready" ? undefined : data.status + " analysis");
  }],
  ["Hourly forecasts", "/api/v2/forecasts", data => {
    assert.ok(["BTC", "ETH"].every(ticker => data.assets.some(item => item.ticker === ticker && item.move_risk?.scorecard)));
    return data.status === "ready" ? undefined : data.status + " forecast coverage";
  }],
  ["Market briefing", "/api/v2/briefing", data => {
    assert.ok(validTime(data.generated_at) && data.forecasts && data.reporting && data.watch);
    return data.market ? undefined : "no current breadth snapshot";
  }],
  ["Collection status", "/api/v2/collection?beat_id=" + nvda, data => {
    assert.equal(data.catalog_interval_seconds, 600); assert.equal(data.session_token, undefined);
  }],
  ["REST tool directory", "/api/v2/tools", data => {
    const names = new Set(data.tools.map(tool => tool.function.name));
    for (const name of ["rarebird_discovery", "rarebird_catalysts", "rarebird_prices", "rarebird_intelligence", "rarebird_token_intelligence", "rarebird_investment"]) assert.ok(names.has(name), name);
  }],
  ["REST research quote", "/api/v2/research", data => {
    assert.deepEqual(data.assets.map(item => item.beat_id), [btc]);
    assert.ok(data.method === "measured" && data.evidence.some(item => goodUrl(item.url) && item.kind === "measurement"));
  }, { question: "What is the current reference price of Bitcoin?", beat_ids: [btc] }],
  ["REST ticker brief", "/api/v2/investment", data => {
    assert.equal(data.ticker, "BTC"); assert.equal(data.research.assets[0]?.beat_id, btc);
    assert.ok(data.stance && Array.isArray(data.research.evidence));
    return data.research.method === "reasoned" ? undefined : data.research.generation_error ?? data.research.method;
  }, { ticker: "BTC", beat_id: btc }],
  ["Agent briefing", "/api/v2/agent?beat_id=" + nvda, data => {
    assert.equal(data.agent_version, "market-agent-v1");
    assert.ok(data.assets.some(item => item.beat_id === nvda) && data.tools.length);
    return data.status === "unavailable" ? "no evidence available" : undefined;
  }],
];

let passed = 0;
let degraded = 0;
let failed = 0;
for (let offset = 0; offset < cases.length; offset += 4) {
  await Promise.all(cases.slice(offset, offset + 4).map(async ([name, path, verify, body]) => {
    try {
      const note = await verify(await request(path, body));
      if (note) degraded++;
      else passed++;
      console.log(JSON.stringify({ check: name, result: note ? "degraded" : "pass", ...(note && { detail: note }) }));
    } catch (error) {
      failed++;
      console.log(JSON.stringify({ check: name, result: "fail", detail: error instanceof Error ? error.message : String(error) }));
    }
  }));
}
console.log(JSON.stringify({ passed, degraded, failed, total: cases.length }));
if (failed || degraded) process.exitCode = 1;
