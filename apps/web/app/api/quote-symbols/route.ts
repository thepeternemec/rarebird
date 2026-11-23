import { SEED_BEATS } from "@rarebird/contracts";
import { NextRequest, NextResponse } from "next/server";

const equityTickers = new Map(SEED_BEATS.filter(asset => asset.asset !== "crypto").map(asset => [asset.beat_id, asset.ticker]));
const knownListings = new Map([
  ["AAPL", "NASDAQ"], ["AMD", "NASDAQ"], ["AMZN", "NASDAQ"], ["GOOG", "NASDAQ"], ["GOOGL", "NASDAQ"],
  ["META", "NASDAQ"], ["MSFT", "NASDAQ"], ["MU", "NASDAQ"], ["NFLX", "NASDAQ"], ["NVDA", "NASDAQ"],
  ["PLTR", "NASDAQ"], ["TSLA", "NASDAQ"], ["BRK.B", "NYSE"], ["JPM", "NYSE"], ["TSM", "NYSE"],
]);

async function readListings() {
  try {
    const response = await fetch("https://www.sec.gov/files/company_tickers_exchange.json", {
      headers: { Accept: "application/json", "User-Agent": "Rarebird contact@rarebird.network" },
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(2_500),
    });
    if (!response.ok) return null;
    const file: { fields: unknown[]; data: unknown[] } = await response.json();
    const tickerColumn = file.fields.indexOf("ticker");
    const exchangeColumn = file.fields.indexOf("exchange");
    if (tickerColumn < 0 || exchangeColumn < 0 || !Array.isArray(file.data)) return null;
    const listings = new Map<string, string>();
    for (const row of file.data) {
      if (!Array.isArray(row)) continue;
      const ticker = row[tickerColumn];
      const exchange = row[exchangeColumn];
      if (typeof ticker !== "string" || !/^[A-Z0-9.-]{1,12}$/.test(ticker)) continue;
      if (exchange === "Nasdaq") listings.set(ticker.replace(".", "-"), "NASDAQ");
      if (exchange === "NYSE") listings.set(ticker.replace(".", "-"), "NYSE");
    }
    return listings.size ? listings : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const ids = [...new Set((request.nextUrl.searchParams.get("beats") ?? "").split(","))];
  if (ids.length > 20 || ids.some(id => !/^b_[a-f0-9]{12}$/.test(id))) {
    return NextResponse.json({ error: "Choose up to 20 catalog assets." }, { status: 400 });
  }
  const tickers = ids.map(id => equityTickers.get(id));
  const needsLookup = tickers.some(ticker => ticker && !knownListings.has(ticker));
  const listings = needsLookup ? await readListings() : null;
  const symbols: Record<string, string> = {};
  for (const [index, ticker] of tickers.entries()) {
    if (!ticker || !/^[A-Z0-9.-]{1,12}$/.test(ticker)) continue;
    const exchange = listings?.get(ticker.replace(".", "-")) ?? knownListings.get(ticker);
    if (exchange) symbols[ids[index]!] = exchange + ":" + ticker.replace("-", ".");
  }
  return NextResponse.json({ symbols }, {
    headers: { "Cache-Control": needsLookup && !listings ? "no-store" : "public, max-age=300, s-maxage=3600" },
  });
}
