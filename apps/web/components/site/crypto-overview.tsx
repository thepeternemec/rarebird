"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import type {
  FearGreedPayload, SignalsPayload, Sourced,
} from "@rarebird/contracts";
import { API_BASE } from "./content";

const POLL_MS = 90_000;
type Feed<T> = { data: T | null; state: "loading" | "ready" | "unavailable" };

function useFeed<T>(path: string, revision: number) {
  const [feed, setFeed] = useState<Feed<T>>({ data: null, state: "loading" });
  useEffect(() => {
    const request = new AbortController();
    const timer = window.setTimeout(() => request.abort("timeout"), 20000);
    setFeed(previous => ({ ...previous, state: "loading" }));
    void (async () => {
      try {
        const response = await fetch(API_BASE + path, { cache: "no-store", signal: request.signal });
        if (!response.ok) throw new Error("Feed unavailable");
        const data = await response.json() as T;
        if (!request.signal.aborted) setFeed({ data, state: "ready" });
      } catch {
        if (!request.signal.aborted || request.signal.reason === "timeout") setFeed({ data: null, state: "unavailable" });
      } finally {
        window.clearTimeout(timer);
      }
    })();
    return () => { window.clearTimeout(timer); request.abort(); };
  }, [path, revision]);
  return feed;
}

const compact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 });
const change = new Intl.NumberFormat("en-US", { style: "percent", signDisplay: "exceptZero", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fundingRate = new Intl.NumberFormat("en-US", { style: "percent", signDisplay: "exceptZero", maximumFractionDigits: 4 });
const present = (number: unknown): number is number => typeof number === "number" && Number.isFinite(number);
const time = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const sourceNames: Record<string, string> = { coingecko: "CoinGecko", defillama: "DefiLlama", "alternative.me": "Alternative.me", okx: "OKX", binance: "Binance" };

function Receipt({ part, now }: { part: Sourced<unknown>; now: number }) {
  const age = now - Date.parse(part.fetched_at);
  const old = part.freshness.status !== "fresh" || age > part.ttl_seconds * 1000;
  return <p className="crypto-receipt">
    <a href={part.source_url} target="_blank" rel="noreferrer">{sourceNames[part.source] ?? part.source} <ArrowUpRight size={12} aria-hidden="true" /></a>
    <span>{old ? "Stale snapshot" : "Fetched"} · {time(part.fetched_at)}</span>
  </p>;
}

function Indicator({ title, value, children, part, now, pending }: {
  title: string; value?: string; children?: ReactNode; part?: Sourced<unknown>; now: number; pending: boolean;
}) {
  return <article className="crypto-panel crypto-indicator">
    <h3>{title}</h3>
    <strong>{value ?? "—"}</strong>
    {value ? <div className="crypto-indicator-note">{children}</div>
      : <p className="crypto-indicator-note">{pending ? "Checking source…" : "Source unavailable"}</p>}
    {part && <Receipt part={part} now={now} />}
  </article>;
}

export default function CryptoOverview() {
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(0);
  const sentiment = useFeed<Sourced<FearGreedPayload>>("/v2/sentiment?limit=2", revision);
  const signals = useFeed<SignalsPayload>("/v2/signals", revision);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (document.visibilityState === "visible") setRevision(previous => previous + 1);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, []);
  const dex = signals.data?.dex_volume;
  const stable = signals.data?.stablecoins;
  const funding = signals.data?.funding;
  const rates = funding && "data" in funding ? funding.data.filter(item => present(item.rate)) : [];
  const fear = sentiment.data?.data.current;

  return <>
    <div className="crypto-actions">
      <span>Market data refreshes every 90 seconds while visible</span>
      <button type="button" className="crypto-refresh" disabled={signals.state === "loading" || sentiment.state === "loading"} onClick={() => {
        setNow(Date.now());
        setRevision(previous => previous + 1);
      }}>
        <RefreshCw size={14} aria-hidden="true" /> Refresh
      </button>
    </div>
    <section className="crypto-context" aria-labelledby="crypto-context-title">
      <h2 id="crypto-context-title">Activity, positioning and sentiment</h2>
      <div className="crypto-indicators">
        <Indicator title="24h DEX volume" value={dex && "data" in dex && present(dex.data.total_24h_usd) ? compact.format(dex.data.total_24h_usd) : undefined}
          part={dex && "data" in dex ? dex : undefined} now={now} pending={signals.state === "loading"}>
          {dex && "data" in dex && present(dex.data.change_24h) ? change.format(dex.data.change_24h) + " versus prior day" : "Rolling trading volume"}
        </Indicator>
        <Indicator title="Stablecoin supply" value={stable && "data" in stable && present(stable.data.circulating_usd) ? compact.format(stable.data.circulating_usd) : undefined}
          part={stable && "data" in stable ? stable : undefined} now={now} pending={signals.state === "loading"}>
          {stable && "data" in stable ? stable.data.assets_tracked + " tracked USD-pegged assets" : ""}
        </Indicator>
        <Indicator title="Perpetual funding" value={rates.length ? fundingRate.format(rates[0]!.rate) : undefined}
          part={funding && "data" in funding ? funding : undefined} now={now} pending={signals.state === "loading"}>
          {rates.length > 0 && <>{rates[0]!.symbol} funding rate{rates.length > 1 && <small>{rates.slice(1).map(rate => rate.symbol + " " + fundingRate.format(rate.rate)).join(" · ")}</small>}</>}
        </Indicator>
        <Indicator title="Fear & greed" value={fear && present(fear.value) ? fear.value + " / 100" : undefined}
          part={sentiment.data ?? undefined} now={now} pending={sentiment.state === "loading"}>
          {fear && <>{fear.classification}<small>Index date · {new Date(fear.observed_at).toLocaleDateString(undefined, { timeZone: "UTC", dateStyle: "medium" })}</small></>}
        </Indicator>
      </div>
    </section>
  </>;
}
