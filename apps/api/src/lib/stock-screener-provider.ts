import { STOCK_SCREENER_UNIVERSE, type StockBar, type StockFeed, type StockFrame, type StockInstrument, type StockQuote } from "@rarebird/contracts";
import { stockSession } from "./stock-screener-engine.js";

export const STOCK_SYMBOLS = [...STOCK_SCREENER_UNIVERSE.map(s => s.symbol), "SPY"];
export function stockFeedConfig() {
  const key = process.env.ALPACA_API_KEY ?? process.env.APCA_API_KEY_ID;
  const secret = process.env.ALPACA_SECRET_KEY ?? process.env.APCA_API_SECRET_KEY;
  const requested = process.env.RAREBIRD_STOCK_FEED ?? "iex";
  const feed: StockFeed = requested === "sip" ? "sip" : "iex";
  return { key, secret, feed, configured: Boolean(key && secret && ["iex", "sip"].includes(requested)),
    coverage: feed === "iex" ? "IEX exchange only; volume and quotes are not consolidated US-market coverage." : "SIP consolidated US equity trades and quotes; subscription entitlement required." };
}
type Fetch = typeof globalThis.fetch;
type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => value && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : {};
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : NaN;
const timestamp = (value: unknown) => typeof value === "string" ? Date.parse(value) : NaN;
export function parseStockBar(value: unknown): StockBar {
  const b = object(value);
  return { time: timestamp(b.t), open: number(b.o), high: number(b.h), low: number(b.l), close: number(b.c), volume: number(b.v) };
}
export function parseStockQuote(value: unknown): StockQuote {
  const q = object(value);
  return { time: timestamp(q.t), bid: number(q.bp), ask: number(q.ap), bid_size: number(q.bs), ask_size: number(q.as) };
}
export async function alpacaRead(path: string, trading = false, fetcher: Fetch = fetch) {
  const config = stockFeedConfig();
  if (!config.configured) throw new Error("stock_feed_not_configured");
  const response = await fetcher((trading ? "https://paper-api.alpaca.markets" : "https://data.alpaca.markets") + path, {
    headers: { "APCA-API-KEY-ID": config.key!, "APCA-API-SECRET-KEY": config.secret!, Accept: "application/json" },
    signal: AbortSignal.timeout(8000), redirect: "error",
  });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "stock_feed_not_entitled" : "stock_feed_unavailable");
  return object(await response.json());
}
export async function readStockClock(fetcher: Fetch = fetch) {
  const clock = await alpacaRead("/v2/clock", true, fetcher);
  if (typeof clock.is_open !== "boolean" || !Number.isFinite(timestamp(clock.timestamp))) throw new Error("stock_clock_invalid");
  return { session_open: clock.is_open, session_checked_at: new Date(timestamp(clock.timestamp)).toISOString() };
}
let identities: { at: number; values: Record<string, StockInstrument> } | undefined;
/** Explicit US-share identities. Never substitutes xStocks, ADR guesses or delayed feeds. */
export async function fetchStockFrame(now = Date.now(), fetcher: Fetch = fetch): Promise<StockFrame> {
  const config = stockFeedConfig();
  if (!config.configured) throw new Error("stock_feed_not_configured");
  const clock = await readStockClock(fetcher);
  let instruments: Record<string, StockInstrument>;
  if (fetcher === fetch && identities && now - identities.at < 3600000) instruments = structuredClone(identities.values);
  else {
    const assets = await Promise.all(STOCK_SYMBOLS.map(async symbol => {
      const asset = await alpacaRead(`/v2/assets/${symbol}`, true, fetcher);
      if (asset.symbol !== symbol || asset.class !== "us_equity" || asset.status !== "active" || asset.tradable !== true
        || typeof asset.exchange !== "string" || !["NASDAQ", "NYSE", "ARCA", "AMEX", "BATS"].includes(asset.exchange)) throw new Error("stock_identity_invalid");
      return [symbol, { symbol, asset_class: "us_equity", exchange: asset.exchange, verified: true, bars: [], quote: null }] as [string, StockInstrument];
    }));
    instruments = Object.fromEntries(assets);
    if (fetcher === fetch) identities = { at: now, values: structuredClone(instruments) };
  }
  // A closed market is a successful session check, not an upstream price failure.
  if (!clock.session_open) return { provider: "alpaca", feed: config.feed, mode: "scheduled", ...clock, received_at: new Date().toISOString(), instruments };
  const query = new URLSearchParams({ symbols: STOCK_SYMBOLS.join(","), timeframe: "1Min", start: `${stockSession(now).day}T00:00:00Z`, end: new Date(now).toISOString(), limit: "10000", feed: config.feed, adjustment: "raw", sort: "asc" });
  // Pagination is across symbols, not a separate limit for every symbol.
  try {
    for (let page = 0; page < 5; page++) {
      const response = await alpacaRead(`/v2/stocks/bars?${query}`, false, fetcher);
      for (const [symbol, bars] of Object.entries(object(response.bars))) {
        if (!instruments[symbol] || !Array.isArray(bars)) throw new Error("stock_bars_invalid");
        instruments[symbol]!.bars.push(...bars.map(parseStockBar));
      }
      if (!response.next_page_token) break;
      if (page === 4 || typeof response.next_page_token !== "string") throw new Error("stock_bars_truncated");
      query.set("page_token", response.next_page_token);
    }
    const quotes = object((await alpacaRead(`/v2/stocks/quotes/latest?${new URLSearchParams({ symbols: STOCK_SYMBOLS.join(","), feed: config.feed })}`, false, fetcher)).quotes);
    for (const symbol of STOCK_SYMBOLS) instruments[symbol]!.quote = parseStockQuote(quotes[symbol]);
  } catch (error) {
    throw error;
  }
  return { provider: "alpaca", feed: config.feed, mode: "scheduled", ...clock, received_at: new Date().toISOString(), instruments };
}
