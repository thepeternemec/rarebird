import { STOCK_SCREENER_UNIVERSE, type StockBar, type StockFrame } from "@rarebird/contracts";

/** Deterministic synthetic observations for tests only; never used by a serving path. */
export function stockFixture(move = 0.00055, now = Date.parse("2026-11-25T16:00:00Z")): StockFrame {
  const bars = (stock: boolean): StockBar[] => {
    let price = stock ? 100 : 500;
    return Array.from({ length: 66 }, (_, i) => {
      const market = 0.0002 * Math.sin(i * 1.9) + 0.0001 * Math.cos(i * 0.7);
      const previous = price;
      if (i) price *= Math.exp(stock ? 1.2 * market + (i > 60 ? move : 0.00008 * Math.sin(i * 2.7)) : market);
      return { time: now - (66 - i) * 60000, open: previous, high: Math.max(previous, price) * 1.0001,
        low: Math.min(previous, price) * 0.9999, close: price, volume: stock && i > 60 ? 3000 : 1000, observed_at: now };
    });
  };
  return { provider: "alpaca", feed: "iex", mode: "scheduled", received_at: new Date(now).toISOString(),
    session_open: true, session_checked_at: new Date(now).toISOString(),
    instruments: Object.fromEntries([...STOCK_SCREENER_UNIVERSE.map(s => s.symbol), "SPY"].map(symbol => {
      const series = bars(symbol !== "SPY"), close = series.at(-1)!.close;
      return [symbol, { symbol, asset_class: "us_equity", exchange: symbol === "SPY" ? "ARCA" : "NASDAQ", verified: true,
        bars: series, quote: { time: now - 1000, bid: close * 0.9999, ask: close * 1.0001, bid_size: 10, ask_size: 10 } }];
    })),
  };
}
