"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import type { DiscoveryFeed } from "@rarebird/contracts";
import { workspaceAssetHref, type WorkspaceMarket } from "@/lib/workspace-links";
import { API_BASE } from "./content";
import "./market-discovery.css";

const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const format = (value: string) => dateFormat.format(new Date(value));
const visitKey = "rarebird:discovery-last-read";
type FeedSnapshot = { scope: string; feed: DiscoveryFeed | null; failed: boolean };
const batchSize = 6;

export default function MarketDiscovery({ market, beatId, id }: { market: WorkspaceMarket; beatId?: string; id?: string }) {
  const heading = useId();
  const scope = beatId ?? market;
  const [snapshot, setSnapshot] = useState<FeedSnapshot>();
  const feed = snapshot?.scope === scope ? snapshot.feed : null;
  const failed = snapshot?.scope === scope && snapshot.failed;
  const [visible, setVisible] = useState(batchSize);
  const events = feed?.events.slice(0, visible) ?? [];
  const [priorVisit, setPriorVisit] = useState(0);
  useEffect(() => {
    try { setPriorVisit(Date.parse(window.localStorage.getItem(visitKey) ?? "")); } catch { /* Storage is optional. */ }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ limit: "18" });
    if (beatId) params.set("beat_id", beatId);
    else params.set("asset", market);
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
  }, [market, beatId, scope]);

  const state = failed ? feed ? "Refresh interrupted. Showing the last scan." : "The signal feed is temporarily unavailable."
    : !feed ? "Loading the latest signals…"
    : feed.status === "unavailable" ? "The discovery feed is temporarily unavailable."
    : feed.status === "warming_up" ? "Waiting for the first catalog scan."
    : feed.status === "partial" ? "Some news sources are delayed." : null;
  const empty = !failed && feed && (feed.status === "ready" || feed.status === "partial") && !feed.events.length;
  return <section id={id} className="rb-discovery" aria-labelledby={heading}>
    <h2 id={heading}>{beatId ? "Signals" : "News signals"}</h2>
    {state && <p className="rb-discovery-meta" role="status">{state}</p>}
    {empty && <p className="rb-discovery-meta">No recent developments met the signal checks.</p>}
    {!!events.length && <ol className="rb-discovery-list">
      {events.map(event => {
        const lead = event.evidence[0];
        if (!lead) return null;
        const newSinceLastRead = priorVisit > 0 && Date.parse(event.first_recorded_at) > priorVisit;
        const isFiling = lead.type === "official_filing";
        return <li key={event.id}>
          <div className="rb-discovery-tags">
            {!beatId && event.assets.map(item => <Link key={item.beat_id} href={workspaceAssetHref(item.beat_id)} prefetch={false}
              aria-label={"Open " + item.label}>{item.ticker}</Link>)}
            <span>{event.label}</span>
            {newSinceLastRead && <span className="rb-discovery-new">New since your visit</span>}
          </div>
          <h3><a href={lead.url} target="_blank" rel="noreferrer">{event.title}</a></h3>
          <div className="rb-discovery-times">
            <a href={lead.url} target="_blank" rel="noreferrer">{lead.source} <ArrowUpRight size={12} aria-hidden="true" /></a>
            <span>·</span><time dateTime={lead.published_at}>{format(lead.published_at)}</time>
          </div>
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
    {!beatId && feed?.coverage.scanned_at && <p className="rb-discovery-meta rb-discovery-coverage">
      {feed.coverage.fresh_news_feeds.toLocaleString()} of {feed.coverage.catalog_total.toLocaleString()} news feeds current
      {" · "} Scanned <time dateTime={feed.coverage.scanned_at}>{format(feed.coverage.scanned_at)}</time>
    </p>}
  </section>;
}
