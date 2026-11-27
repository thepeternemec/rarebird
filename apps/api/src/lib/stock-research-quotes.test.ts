import assert from "node:assert/strict";
import { test } from "node:test";
import { researchQuoteIds, researchStockQuotes } from "./stock-research-quotes.js";

test("research quote requests accept only bounded stock catalog identities", () => {
  assert.deepEqual(researchQuoteIds("b_bb964843350e,b_bb964843350e"), ["b_bb964843350e"]);
  for (const raw of ["", "NVDA", "b_06c91290de1c", "https://example.com"]) assert.throws(() => researchQuoteIds(raw));
});
test("Alpaca quotes retain timestamp and feed, reject crossed or future quotes and never invent a trade price", async () => {
  const key = process.env.ALPACA_API_KEY, secret = process.env.ALPACA_SECRET_KEY, feed = process.env.RAREBIRD_STOCK_FEED;
  process.env.ALPACA_API_KEY = "test-key"; process.env.ALPACA_SECRET_KEY = "test-secret"; process.env.RAREBIRD_STOCK_FEED = "iex";
  const now = Date.parse("2026-11-27T16:00:00Z");
  let quote = { bp: 99, ap: 101, bs: 5, as: 5, t: new Date(now - 300_000).toISOString() };
  const fetcher = (async (input: unknown) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "data.alpaca.markets");
    assert.equal(url.searchParams.get("feed"), "iex");
    assert.equal(url.searchParams.get("symbols"), "NVDA");
    return Response.json({ quotes: { NVDA: quote } });
  }) as typeof fetch;
  try {
    const data = await researchStockQuotes(["b_bb964843350e"], fetcher, now);
    assert.equal(data.quotes.b_bb964843350e?.midpoint, 100);
    assert.equal(data.quotes.b_bb964843350e?.observed_at, quote.t, "old quotes keep their original timestamp");
    assert.equal(data.feed, "iex");
    assert.ok(!JSON.stringify(data).includes("test-secret"));
    quote = { ...quote, ap: 98 };
    assert.deepEqual((await researchStockQuotes(["b_bb964843350e"], fetcher, now)).quotes, {});
    quote = { ...quote, ap: 101, t: new Date(now + 60_000).toISOString() };
    assert.deepEqual((await researchStockQuotes(["b_bb964843350e"], fetcher, now)).quotes, {});
  } finally {
    for (const [name, value] of Object.entries({ ALPACA_API_KEY: key, ALPACA_SECRET_KEY: secret, RAREBIRD_STOCK_FEED: feed })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
