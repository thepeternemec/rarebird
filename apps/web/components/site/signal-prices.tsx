"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { CryptoMarketRow, CryptoMarketsPayload, Sourced } from "@rarebird/contracts";
import type { ResearchStockQuotes, ResearchStockQuote } from "@rarebird/api";
import type { LookupAsset } from "./landing-lookup-data";
import { API_BASE } from "./content";
import "./market-discovery.css";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumSignificantDigits: 7 });
const percent = new Intl.NumberFormat("en-US", { style: "percent", signDisplay: "exceptZero", maximumFractionDigits: 2 });
const time = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

export function useSignalPrices(assets: LookupAsset[]) {
  const ids = [...new Set(assets.filter(asset => asset.asset === "equity").map(asset => asset.beat_id))].sort().slice(0, 20).join(",");
  const needsCrypto = assets.some(asset => asset.asset === "crypto");
  const [stocks, setStocks] = useState<{ ids: string; data: ResearchStockQuotes | null; failed: boolean }>();
  const [crypto, setCrypto] = useState<Sourced<CryptoMarketsPayload> | null>();
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!ids) return;
    let current: AbortController | undefined;
    let stopped = false;
    async function refresh() {
      if (document.hidden || current) return;
      const request = new AbortController();
      current = request;
      try {
        const response = await fetch(API_BASE + "/v2/stock-quotes?beats=" + encodeURIComponent(ids), {
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
        });
        if (!response.ok) throw new Error("Stock quotes unavailable");
        const data = await response.json() as ResearchStockQuotes;
        if (!stopped) setStocks({ ids, data, failed: false });
      } catch {
        if (!stopped) setStocks(previous => ({ ids, data: previous?.ids === ids ? previous.data : null, failed: true }));
      } finally { current = undefined; }
    }
    void refresh();
    const timer = window.setInterval(refresh, 15_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { stopped = true; current?.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [ids]);

  useEffect(() => {
    if (!needsCrypto) return;
    let current: AbortController | undefined;
    async function refresh() {
      if (document.hidden || current) return;
      const request = new AbortController();
      current = request;
      try {
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]);
        const response = await fetch(API_BASE + "/v2/markets", { signal });
        if (!response.ok) throw new Error("Crypto prices unavailable");
        const result = await response.json() as Sourced<CryptoMarketsPayload>;
        if (!request.signal.aborted) setCrypto(result);
      } catch {
        if (!request.signal.aborted) setCrypto(previous => previous ?? null);
      } finally {
        if (!request.signal.aborted) setNow(Date.now());
        current = undefined;
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      current?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [needsCrypto]);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);
  return { stocks: stocks?.ids === ids ? stocks : undefined, crypto, now };
}

function StockQuote({ quote, data, now, failed }: { quote: ResearchStockQuote; data: ResearchStockQuotes; now: number; failed: boolean }) {
  const stale = failed || now - Date.parse(quote.observed_at) > 90_000;
  return <div className="rb-signal-quote rb-signal-crypto rb-signal-stock">
    <div><strong>{money.format(quote.midpoint)}</strong><small>Bid–ask midpoint</small></div>
    <p>Bid {money.format(quote.bid)} · Ask {money.format(quote.ask)}</p>
    <p>Alpaca · {data.feed.toUpperCase()} · {stale ? "Last available quote" : "Latest quote"}<br />
      <time dateTime={quote.observed_at}>{new Date(quote.observed_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short" })}</time></p>
    <p>{data.coverage}</p>
  </div>;
}

function findCryptoQuote(asset: LookupAsset, rows: CryptoMarketRow[]) {
  const name = normalize(asset.label);
  return rows.find(row => row.symbol.toUpperCase() === asset.ticker.toUpperCase()
    && (normalize(row.name) === name || normalize(row.id) === name));
}

export function SignalPrice({ asset, prices }: { asset: LookupAsset; prices: ReturnType<typeof useSignalPrices> }) {
  if (asset.asset === "equity") {
    if (!prices.stocks) return <p className="rb-signal-price-note">Checking Alpaca stock quote…</p>;
    const data = prices.stocks.data;
    const quote = data?.quotes[asset.beat_id];
    if (data && quote) return <StockQuote quote={quote} data={data} now={prices.now} failed={prices.stocks.failed} />;
    return <p className="rb-signal-price-note">Alpaca quote unavailable for {asset.ticker}. No substitute price is shown.</p>;
  }
  if (!prices.crypto) return <p className="rb-signal-price-note">{prices.crypto === null ? "Crypto price unavailable" : "Checking crypto price…"}</p>;
  const quote = findCryptoQuote(asset, prices.crypto.data.assets);
  const observedAt = quote?.observed_at;
  if (!quote || !observedAt || !Number.isFinite(Date.parse(observedAt)) || quote.price_usd === null || !Number.isFinite(quote.price_usd)) {
    return <p className="rb-signal-price-note">Crypto price unavailable for {asset.ticker}</p>;
  }
  const age = prices.now - Date.parse(observedAt);
  if (age < -60_000) return <p className="rb-signal-price-note">Crypto price unavailable for {asset.ticker}</p>;
  const stale = prices.crypto.freshness.status !== "fresh" || age > 10 * 60_000;
  const move = quote.change_24h;
  return <div className="rb-signal-quote rb-signal-crypto">
    <div><strong>{money.format(quote.price_usd)}</strong>
      {move !== null && Number.isFinite(move) && <span data-direction={move > 0 ? "up" : move < 0 ? "down" : "flat"}>{percent.format(move)} <small>24h</small></span>}
    </div>
    <a href={"https://www.coingecko.com/en/coins/" + encodeURIComponent(quote.id)} target="_blank" rel="noreferrer">CoinGecko · {stale ? "Last available · " : ""}<time dateTime={observedAt}>{time.format(new Date(observedAt))}</time> <ArrowUpRight size={12} aria-hidden="true" /></a>
  </div>;
}

export function AssetSignalPrice({ asset }: { asset: LookupAsset }) {
  const prices = useSignalPrices([asset]);
  return <div className="rb-signal-selected" aria-label={asset.label + " price"}>
    <SignalPrice asset={asset} prices={prices} />
  </div>;
}
