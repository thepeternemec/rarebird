"use client";

import { useEffect, useId, useState } from "react";
import { ArrowUpRight, ChevronDown, X } from "lucide-react";
import type { DiscoveryFeed } from "@rarebird/contracts";
import CatalogSearch from "./catalog-search";
import type { LookupAsset } from "./landing-lookup-data";
import { API_BASE } from "./content";
import { SignalPrice, useSignalPrices } from "./signal-prices";
import { loadStoryFeed } from "./story-feed";
import "./market-discovery.css";

const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const format = (value: string) => dateFormat.format(new Date(value));
const visitKey = "rarebird:discovery-last-read";
type FeedSnapshot = { scope: string; feed: DiscoveryFeed | null; failed: boolean };
const tabs = [{ id: "all", label: "All" }, { id: "equity", label: "Stocks" }, { id: "crypto", label: "Crypto" }] as const;

const batchSize = 6;
type Reporting = { beatId: string; stories: Awaited<ReturnType<typeof loadStoryFeed>> | null };

export default function MarketDiscovery({ initialMarket = "all", showControls = true }: {
  initialMarket?: (typeof tabs)[number]["id"];
  showControls?: boolean;
}) {
  const heading = useId();
  const [asset, setAsset] = useState(initialMarket);
  const [selection, setSelection] = useState<LookupAsset | null>(null);
  const beatId = selection?.beat_id;
  const scope = beatId ?? asset;
  const searchId = heading + "-search";
  const [snapshot, setSnapshot] = useState<FeedSnapshot | null>(null);
  const feed = snapshot?.scope === scope ? snapshot.feed : null;
  const failed = snapshot?.scope === scope && snapshot.failed;
  const [visible, setVisible] = useState(batchSize);
  const [reporting, setReporting] = useState<Reporting>();
  const events = feed?.events.slice(0, visible) ?? [];
  const prices = useSignalPrices(selection ? [selection] : events.flatMap(event => event.assets.slice(0, 1)));
  const [priorVisit, setPriorVisit] = useState(0);
  useEffect(() => {
    try { setPriorVisit(Date.parse(window.localStorage.getItem(visitKey) ?? "")); } catch { /* Storage is optional. */ }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ limit: "18" });
    if (beatId) params.set("beat_id", beatId);
    else if (asset !== "all") params.set("asset", asset);
    let active = true;
    let request: AbortController | undefined;
    const load = async () => {
      if (document.visibilityState === "hidden") return;
      request?.abort();
      const controller = new AbortController();
      request = controller;
      const timeout = window.setTimeout(() => controller.abort(), 12_000);
      try {
        const response = await fetch(API_BASE + "/v2/discovery?" + params, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Discovery unavailable");
        const next = await response.json() as DiscoveryFeed;
        if (!active || request !== controller) return;
        setSnapshot({ scope, feed: next, failed: false });
        if (next.coverage.scanned_at) {
          try {
            const previous = window.localStorage.getItem(visitKey);
            if (!previous || previous < next.coverage.scanned_at) window.localStorage.setItem(visitKey, next.coverage.scanned_at);
          } catch { /* Storage is optional. */ }
        }
      } catch {
        if (active && request === controller) setSnapshot(previous => ({
          scope, feed: previous?.scope === scope ? previous.feed : null, failed: true,
        }));
      } finally {
        window.clearTimeout(timeout);
      }
    };
    void load();
    const timer = window.setInterval(load, 60_000);
    document.addEventListener("visibilitychange", load);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
      request?.abort();
    };
  }, [asset, beatId, scope]);

  const needsReporting = !!beatId && snapshot?.scope === scope && !feed?.events.length;
  useEffect(() => {
    if (!beatId || !needsReporting) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]);
    void loadStoryFeed(API_BASE, beatId, 60, signal)
      .then(stories => { if (!controller.signal.aborted) setReporting({ beatId, stories }); })
      .catch(() => { if (!controller.signal.aborted) setReporting({ beatId, stories: null }); });
    return () => controller.abort();
  }, [beatId, needsReporting, feed?.coverage.scanned_at]);

  const selectedStories = reporting?.beatId === beatId ? reporting?.stories : undefined;
  const state = failed ? feed ? "Refresh interrupted. Showing the last scan." : "The signal feed is temporarily unavailable."
    : !feed ? "Loading the latest signals…"
    : feed.status === "unavailable" ? "The discovery feed is temporarily unavailable."
    : feed.status === "warming_up" ? "Waiting for the first catalog scan."
    : feed.status === "partial" ? "Some news sources are delayed." : null;
  const empty = !failed && feed && (feed.status === "ready" || feed.status === "partial") && !feed.events.length;
  const shownPrices = new Set<string>();
  const cryptoOnly = initialMarket === "crypto" && !showControls;

  return <section className="rb-discovery" aria-labelledby={heading}>
    <header>
      <h1 id={heading}>{cryptoOnly ? "Crypto news" : "News signals"}</h1>
      <p className="rb-discovery-intro">{cryptoOnly
        ? "What changed in crypto, with prices and source links."
        : "What changed in stocks and crypto, with prices and source links."}</p>
    </header>
    {showControls && <>
      <div className="rb-discovery-controls">
        <CatalogSearch id={searchId} className="rb-discovery-search" onSelect={item => { setSelection(item); setVisible(batchSize); }} />
        <div className="rb-discovery-tabs" role="group" aria-label="Filter news signals">
          {tabs.map(tab => <button key={tab.id} type="button" aria-pressed={!selection && tab.id === asset} onClick={() => {
            setSelection(null);
            setAsset(tab.id);
            setVisible(batchSize);
          }}>{tab.label}</button>)}
        </div>
      </div>
      {selection && <div className="rb-signal-selected" aria-label={selection.label + " price and reporting"}>
        <div className="rb-discovery-selection">
          <p><strong>{selection.ticker}</strong> {selection.label}</p>
          <a href={"/ask?" + new URLSearchParams({ ticker: selection.ticker, beat_id: selection.beat_id })}>Ask Rarebird <ArrowUpRight size={13} aria-hidden="true" /></a>
          <button type="button" aria-label="Clear asset filter" onClick={() => { setSelection(null); setVisible(batchSize); document.getElementById(searchId)?.focus(); }}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <SignalPrice asset={selection} prices={prices} />
      </div>}
    </>}
    {state && <p className="rb-discovery-meta" role="status">{state}</p>}
    {empty && <p className="rb-discovery-meta" role="status">{selection
      ? "No recent developments for " + selection.label + " met the signal checks."
      : "No recent developments met the signal checks."}</p>}
    {needsReporting && selectedStories === undefined && <p className="rb-discovery-meta" role="status">Checking recent reporting…</p>}
    {needsReporting && selectedStories !== undefined && !selectedStories?.items.length && <p className="rb-discovery-meta" role="status">No recent reporting is available for this asset.</p>}
    {needsReporting && !!selectedStories?.items.length && <div className="rb-discovery-reporting">
      <h2>Latest reporting</h2>
      {selectedStories.freshness.status !== "fresh" && <p className="rb-discovery-meta">Showing the last available reporting.</p>}
      <ol className="rb-discovery-list">{selectedStories.items.slice(0, batchSize).map(item => <li key={item.id}>
        <h3><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a></h3>
        <p className="rb-discovery-times">{item.source} · <time dateTime={item.published_at}>{format(item.published_at)}</time></p>
      </li>)}</ol>
    </div>}
    {!!events.length && <ol className="rb-discovery-list">
      {events.map(event => {
        const lead = event.evidence[0];
        if (!lead) return null;
        const firstAsset = event.assets[0];
        const newSinceLastRead = priorVisit > 0 && Date.parse(event.first_recorded_at) > priorVisit;
        const isFiling = lead.type === "official_filing";
        const showPrice = !selection && firstAsset && !shownPrices.has(firstAsset.beat_id);
        if (showPrice) shownPrices.add(firstAsset.beat_id);
        return <li key={event.id}>
          <div className="rb-discovery-tags">
            {event.assets.map(item => <a key={item.beat_id} href={"/ask?" + new URLSearchParams({ ticker: item.ticker, beat_id: item.beat_id })}
              aria-label={"Ask Rarebird about " + item.label}>{item.ticker}</a>)}
            <span>{event.label}</span>
            {newSinceLastRead && <span className="rb-discovery-new">New since your visit</span>}
          </div>
          <h3><a href={lead.url} target="_blank" rel="noreferrer">{event.title}</a></h3>
          <div className="rb-discovery-times">
            <a href={lead.url} target="_blank" rel="noreferrer">{lead.source} <ArrowUpRight size={12} aria-hidden="true" /></a>
            <span>·</span><time dateTime={lead.published_at}>{format(lead.published_at)}</time>
          </div>
          {showPrice && <SignalPrice asset={firstAsset} prices={prices} />}
          <details>
            <summary>Evidence and next check <ChevronDown size={13} aria-hidden="true" /></summary>
            <p>{event.next_check}</p>
            <p className="rb-discovery-meta">{isFiling ? "Filing accepted" : "Published"} · <time dateTime={lead.published_at}>{format(lead.published_at)}</time>
              {" · "} Recorded <time dateTime={event.first_recorded_at}>{format(event.first_recorded_at)}</time></p>
            {event.evidence.slice(1).map(item => <p key={item.url} className="rb-discovery-meta">
              <a href={item.url} target="_blank" rel="noreferrer">{item.source} <ArrowUpRight size={12} aria-hidden="true" /></a>
              {" · "} <time dateTime={item.published_at}>{format(item.published_at)}</time>
            </p>)}
          </details>
        </li>;
      })}
    </ol>}
    {feed && feed.events.length > visible && <button type="button" className="rb-discovery-more" onClick={() => setVisible(count => count + batchSize)}>Show more signals</button>}
    {feed?.coverage.scanned_at && <p className="rb-discovery-meta rb-discovery-coverage">
      {feed.coverage.fresh_news_feeds.toLocaleString()} of {feed.coverage.catalog_total.toLocaleString()} news feeds current
      {" · "} Scanned <time dateTime={feed.coverage.scanned_at}>{format(feed.coverage.scanned_at)}</time>
    </p>}
  </section>;
}
