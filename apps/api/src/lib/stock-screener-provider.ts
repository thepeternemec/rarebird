import { STOCK_SCREENER_UNIVERSE, type StockBar, type StockFeed, type StockFrame, type StockInstrument, type StockQuote } from "@rarebird/contracts";

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
async function alpacaReadValue(path: string, trading = false, fetcher: Fetch = fetch): Promise<unknown> {
  const config = stockFeedConfig();
  if (!config.configured) throw new Error("stock_feed_not_configured");
  const response = await fetcher((trading ? "https://paper-api.alpaca.markets" : "https://data.alpaca.markets") + path, {
    headers: { "APCA-API-KEY-ID": config.key!, "APCA-API-SECRET-KEY": config.secret!, Accept: "application/json" },
    signal: AbortSignal.timeout(8000), redirect: "error",
  });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "stock_feed_not_entitled" : "stock_feed_unavailable");
  return response.json();
}
export async function alpacaRead(path: string, trading = false, fetcher: Fetch = fetch) {
  return object(await alpacaReadValue(path, trading, fetcher));
}
export async function readStockClock(fetcher: Fetch = fetch) {
  const clock = await alpacaRead("/v2/clock", true, fetcher);
  if (typeof clock.is_open !== "boolean" || !Number.isFinite(timestamp(clock.timestamp))) throw new Error("stock_clock_invalid");
  return { session_open: clock.is_open, session_checked_at: new Date(timestamp(clock.timestamp)).toISOString() };
}

let identities: { at: number; values: Record<string, StockInstrument> } | undefined;
export async function readStockQuotes(symbols: string[], fetcher: Fetch = fetch) {
  const result: Record<string, StockQuote> = {};
  for (let start = 0; start < symbols.length; start += 50) {
    const group = symbols.slice(start, start + 50);
    const response = await alpacaRead("/v2/stocks/quotes/latest?" + new URLSearchParams({ symbols: group.join(","), feed: stockFeedConfig().feed }), false, fetcher);
    for (const symbol of group) result[symbol] = parseStockQuote(object(response.quotes)[symbol]);
  }
  return result;
}
/** One identity request and bounded batches support an entire constituent snapshot. */
export async function fetchStockFrame(now = Date.now(), fetcher: Fetch = fetch, symbols = STOCK_SYMBOLS): Promise<StockFrame> {
  const config = stockFeedConfig();
  if (!config.configured) throw new Error("stock_feed_not_configured");
  const clock = await readStockClock(fetcher);
  let instruments: Record<string, StockInstrument>;
  if (fetcher === fetch && identities && now - identities.at < 3600000) instruments = structuredClone(identities.values);
  else {
    const assets = await alpacaReadValue("/v2/assets?status=active&asset_class=us_equity", true, fetcher);
    if (!Array.isArray(assets)) throw new Error("stock_identity_invalid");
    const bySymbol = new Map(assets.map(value => { const asset = object(value); return [asset.symbol, asset]; }));
    instruments = Object.fromEntries(symbols.map(symbol => {
      const asset = bySymbol.get(symbol);
      const verified = asset?.class === "us_equity" && asset.status === "active" && asset.tradable === true
        && typeof asset.exchange === "string" && ["NASDAQ", "NYSE", "ARCA", "AMEX", "BATS"].includes(asset.exchange);
      return [symbol, { symbol, asset_class: "us_equity", exchange: String(asset?.exchange ?? ""), verified, bars: [], quote: null }];
    }));
    if (!instruments.SPY?.verified) throw new Error("stock_identity_invalid");
    if (fetcher === fetch) identities = { at: now, values: structuredClone(instruments) };
  }
  if (!clock.session_open) return { provider: "alpaca", feed: config.feed, mode: "scheduled", ...clock, received_at: new Date(now).toISOString(), instruments };
  const groups = Array.from({ length: Math.ceil(symbols.length / 50) }, (_, i) => symbols.slice(i * 50, i * 50 + 50));
  const start = new Date(now - 90 * 60000).toISOString();
  let next = 0;
  async function batch() {
    while (next < groups.length) {
      const group = groups[next++]!;
      const query = new URLSearchParams({ symbols: group.join(","), timeframe: "1Min", start, end: new Date(now).toISOString(), limit: "10000", feed: config.feed, adjustment: "raw", sort: "asc" });
      const seen = new Set<string>();
      for (let page = 0; page < 5; page++) {
        const response = await alpacaRead("/v2/stocks/bars?" + query, false, fetcher);
        for (const [symbol, bars] of Object.entries(object(response.bars))) {
          if (!group.includes(symbol) || !Array.isArray(bars)) throw new Error("stock_bars_invalid");
          instruments[symbol]!.bars.push(...bars.map(parseStockBar));
        }
        if (!response.next_page_token) break;
        if (page === 4 || typeof response.next_page_token !== "string" || seen.has(response.next_page_token)) throw new Error("stock_bars_truncated");
        seen.add(response.next_page_token); query.set("page_token", response.next_page_token);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, groups.length) }, batch));
  const quotes = await readStockQuotes(symbols, fetcher);
  for (const symbol of symbols) instruments[symbol]!.quote = quotes[symbol] ?? null;
  return { provider: "alpaca", feed: config.feed, mode: "scheduled", ...clock, received_at: new Date().toISOString(), instruments };
}
