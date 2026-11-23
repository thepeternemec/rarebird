"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { CryptoMarketRow, CryptoMarketsPayload, Sourced } from "@rarebird/contracts";
import type { LookupAsset } from "./landing-lookup-data";
import { API_BASE } from "./content";
import "./market-discovery.css";

const supportedSymbol = /^(NASDAQ|NYSE):[A-Z0-9.]{1,12}$/;
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumSignificantDigits: 7 });
const percent = new Intl.NumberFormat("en-US", { style: "percent", signDisplay: "exceptZero", maximumFractionDigits: 2 });
const time = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

export function useSignalPrices(assets: LookupAsset[]) {
  const ids = [...new Set(assets.filter(asset => asset.asset === "equity").map(asset => asset.beat_id))].sort().slice(0, 20).join(",");
  const needsCrypto = assets.some(asset => asset.asset === "crypto");
  const [stocks, setStocks] = useState<{ ids: string; symbols: Record<string, string> }>();
  const [crypto, setCrypto] = useState<Sourced<CryptoMarketsPayload> | null>();
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!ids) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]);
    void fetch("/api/quote-symbols?beats=" + encodeURIComponent(ids), { signal })
      .then(response => {
        if (!response.ok) throw new Error("Stock listings unavailable");
        return response.json() as Promise<{ symbols: Record<string, string> }>;
      })
      .then(result => { if (!controller.signal.aborted) setStocks({ ids, symbols: result.symbols }); })
      .catch(() => { if (!controller.signal.aborted) setStocks({ ids, symbols: {} }); });
    return () => controller.abort();
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

  return { stocks: stocks?.ids === ids ? stocks.symbols : undefined, crypto, now };
}

function StockQuote({ asset, symbol }: { asset: LookupAsset; symbol: string }) {
  const [theme, setTheme] = useState("dark");
  useEffect(() => {
    const root = document.documentElement;
    function sync() { setTheme(root.dataset.theme === "light" ? "light" : "dark"); }
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  const href = "https://www.tradingview.com/symbols/" + symbol.replace(":", "-") + "/";
  const config = JSON.stringify({ symbol, width: "100%", colorTheme: theme, isTransparent: true, locale: "en" });
  const widget = "https://s.tradingview.com/embed-widget/single-quote/?locale=en#" + encodeURIComponent(config);
  return <div className="rb-signal-quote">
    <iframe key={theme} title={asset.ticker + " share price and daily change"} src={widget} loading="lazy"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerPolicy="strict-origin-when-cross-origin" />
    <a href={href} target="_blank" rel="noreferrer">TradingView · Delayed stock quote <ArrowUpRight size={12} aria-hidden="true" /></a>
  </div>;
}

function findCryptoQuote(asset: LookupAsset, rows: CryptoMarketRow[]) {
  const name = normalize(asset.label);
  return rows.find(row => row.symbol.toUpperCase() === asset.ticker.toUpperCase()
    && (normalize(row.name) === name || normalize(row.id) === name));
}

export function SignalPrice({ asset, prices }: { asset: LookupAsset; prices: ReturnType<typeof useSignalPrices> }) {
  if (asset.asset === "equity") {
    const symbol = prices.stocks?.[asset.beat_id];
    if (symbol && supportedSymbol.test(symbol)) return <StockQuote asset={asset} symbol={symbol} />;
    if (!prices.stocks) return <p className="rb-signal-price-note">Checking stock quote…</p>;
    return <p className="rb-signal-price-note">Stock quote unavailable <a href={"https://www.tradingview.com/symbols/?search=" + encodeURIComponent(asset.ticker)} target="_blank" rel="noreferrer">Find {asset.ticker} on TradingView <ArrowUpRight size={12} aria-hidden="true" /></a></p>;
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
