import { SEED_BEATS } from "@rarebird/contracts";
import { readStockQuotes, stockFeedConfig } from "./stock-screener-provider.js";

const stocks = new Map(SEED_BEATS.filter(a => a.asset !== "crypto").map(a => [a.beat_id, a.ticker]));
export type ResearchStockQuote = { symbol: string; bid: number; ask: number; midpoint: number; observed_at: string };
export type ResearchStockQuotes = { source: "alpaca"; feed: "iex" | "sip"; coverage: string; fetched_at: string; quotes: Record<string, ResearchStockQuote> };
export function researchQuoteIds(raw: string) {
  const ids = [...new Set(raw.split(","))];
  if (!ids.length || ids.length > 20 || ids.some(id => !stocks.has(id))) throw new Error("invalid_stock_selection");
  return ids;
}
export async function researchStockQuotes(ids: string[], fetcher: typeof fetch = fetch, now = Date.now()): Promise<ResearchStockQuotes> {
  researchQuoteIds(ids.join(","));
  const symbols = ids.map(id => stocks.get(id)!);
  const readings = await readStockQuotes(symbols, fetcher);
  const quotes: ResearchStockQuotes["quotes"] = {};
  ids.forEach((id, i) => {
    const q = readings[symbols[i]!];
    if (!q || !Number.isFinite(q.time) || q.time > now + 5000 || !Number.isFinite(q.bid) || !Number.isFinite(q.ask)
      || q.bid <= 0 || q.ask < q.bid) return;
    quotes[id] = { symbol: symbols[i]!, bid: q.bid, ask: q.ask, midpoint: (q.bid + q.ask) / 2, observed_at: new Date(q.time).toISOString() };
  });
  const config = stockFeedConfig();
  return { source: "alpaca", feed: config.feed, coverage: config.coverage, fetched_at: new Date(now).toISOString(), quotes };
}
