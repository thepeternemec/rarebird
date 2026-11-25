import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchStockFrame, stockFeedConfig, STOCK_SYMBOLS } from "./stock-screener-provider.js";
import { stockWebhookConfig, stockWebhookSignature } from "./stock-screener-delivery.js";
import { readStockScreener, runStockScreener } from "./stock-screener-store.js";

test("stock adapter verifies actual US-share identities and pages symbols without a delayed fallback", async () => {
  const saved = { ...process.env };
  try {
    process.env.ALPACA_API_KEY = "test-key"; process.env.ALPACA_SECRET_KEY = "test-secret"; process.env.RAREBIRD_STOCK_FEED = "iex";
    const requests: string[] = [], now = Date.now();
    const fetcher: typeof fetch = async (input, init) => {
      const url = new URL(String(input)); requests.push(url.pathname + url.search);
      assert.equal((init!.headers as Record<string, string>)["APCA-API-KEY-ID"], "test-key");
      assert.ok(["paper-api.alpaca.markets", "data.alpaca.markets"].includes(url.hostname));
      let value: unknown;
      if (url.pathname === "/v2/clock") value = { is_open: true, timestamp: new Date(now).toISOString() };
      else if (url.pathname.startsWith("/v2/assets/")) value = { symbol: url.pathname.split("/").at(-1), class: "us_equity", exchange: "NASDAQ", status: "active", tradable: true };
      else if (url.pathname === "/v2/stocks/bars") {
        assert.equal(url.searchParams.get("feed"), "iex"); assert.equal(url.searchParams.get("end"), new Date(now).toISOString());
        value = { bars: { [url.searchParams.has("page_token") ? "SPY" : "NVDA"]: [{ t: new Date(now - 60000).toISOString(), o: 10, h: 11, l: 9, c: 10, v: 100 }] }, next_page_token: url.searchParams.has("page_token") ? null : "second" };
      } else value = { quotes: Object.fromEntries(STOCK_SYMBOLS.map(s => [s, { t: new Date(now).toISOString(), bp: 10, ap: 11, bs: 1, as: 1 }])) };
      return new Response(JSON.stringify(value));
    };
    const frame = await fetchStockFrame(now, fetcher);
    assert.equal(frame.instruments.NVDA!.asset_class, "us_equity"); assert.equal(frame.instruments.SPY!.bars.length, 1);
    assert.equal(requests.filter(r => r.startsWith("/v2/assets/")).length, 5);
    assert.equal(requests.filter(r => r.startsWith("/v2/stocks/bars")).length, 2);
    await assert.rejects(fetchStockFrame(now, async () => new Response("", { status: 403 })), /stock_feed_not_entitled/);
    await assert.rejects(fetchStockFrame(now, async input => new Response(JSON.stringify(String(input).includes("clock") ? { is_open: true, timestamp: new Date(now).toISOString() } : { symbol: "NVDAx", class: "crypto" }))), /stock_identity_invalid/);
    process.env.RAREBIRD_STOCK_FEED = "delayed_sip";
    assert.equal(stockFeedConfig().configured, false);
    await assert.rejects(fetchStockFrame(now, fetcher), /stock_feed_not_configured/);
  } finally { process.env = saved; }
});
test("unconfigured stock reads and workers are explicit no-ops, never a synthetic quiet market", async () => {
  const saved = { ...process.env };
  try {
    delete process.env.ALPACA_API_KEY; delete process.env.APCA_API_KEY_ID; delete process.env.DATABASE_URL;
    const output = await readStockScreener();
    assert.equal(output.status, "not_configured"); assert.equal(output.active.length, 0);
    assert.equal(output.universe.length, 4); assert.ok(output.coverage.every(c => !c.metrics));
    assert.equal((await runStockScreener()).status, "not_configured");
  } finally { process.env = saved; }
});
test("webhooks require explicit HTTPS configuration and use reproducible timestamped HMACs", () => {
  const saved = { ...process.env };
  try {
    process.env.RAREBIRD_STOCK_SCREENER_WEBHOOK_SECRET = "s".repeat(32);
    for (const url of ["http://example.com", "https://127.0.0.1", "https://[::1]", "https://localhost", "https://host.internal", "https://example.com:8443"]) {
      process.env.RAREBIRD_STOCK_SCREENER_WEBHOOK_URL = url; assert.equal(stockWebhookConfig().configured, false, url);
    }
    process.env.RAREBIRD_STOCK_SCREENER_WEBHOOK_URL = "https://example.com/alerts";
    assert.equal(stockWebhookConfig().configured, true);
    assert.equal(stockWebhookSignature("secret", "1", "{}"), stockWebhookSignature("secret", "1", "{}"));
    assert.notEqual(stockWebhookSignature("secret", "1", "{}"), stockWebhookSignature("secret", "2", "{}"));
  } finally { process.env = saved; }
});
