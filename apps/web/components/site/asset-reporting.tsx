"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import type { LookupAsset } from "./landing-lookup-data";
import type { ResearchSnapshot } from "./agent-context";
import AgentContextPanel from "./agent-context-panel";
import DeferredDetails from "./deferred-details";
import { loadStoryFeed } from "./story-feed";
import { API_BASE } from "./content";

const SignalField = dynamic(() => import("@/components/signal-field"), { ssr: false });
const stamp = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const pageSize = 6;

export default function AssetReporting({ asset }: { asset: LookupAsset }) {
  const [snapshot, setSnapshot] = useState<ResearchSnapshot | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [revision, setRevision] = useState(0);
  const [visible, setVisible] = useState(pageSize);
  const { beat_id: beatId } = asset;

  useEffect(() => {
    let request: AbortController | undefined;
    async function refresh() {
      if (document.hidden || request) return;
      const controller = new AbortController();
      request = controller;
      const timer = window.setTimeout(() => controller.abort(), 12_000);
      setState("loading");
      try {
        const feed = await loadStoryFeed(API_BASE, beatId, 200, controller.signal);
        if (request !== controller) return;
        setSnapshot({ ...feed, beatId, receivedAt: new Date().toISOString() });
        setState("ready");
      } catch {
        if (request === controller) setState("error");
      } finally {
        window.clearTimeout(timer);
        if (request === controller) request = undefined;
      }
    }
    void refresh();
    const interval = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      const previous = request;
      request = undefined;
      previous?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [beatId, revision]);

  const current = snapshot?.beatId === beatId ? snapshot : null;
  const items = current?.items ?? [];
  const checkedAt = current?.freshness.last_success_at;
  const notice = state === "error"
    ? current ? "Refresh interrupted. Showing the last available reporting." : "Reporting is temporarily unavailable."
    : !current ? "Checking recent reporting…"
    : current.freshness.status !== "fresh" ? "Collection freshness is delayed or unconfirmed."
    : "";
  const reload = () => setRevision(value => value + 1);

  return <section id="news" className="rb-asset-reporting" aria-labelledby="rb-asset-news-heading">
    <div className="rb-section-title">
      <h2 id="rb-asset-news-heading">Latest news</h2>
      <button type="button" className="rb-workspace-action" onClick={reload} disabled={state === "loading"}>Refresh news</button>
    </div>
    {notice && <p className="rb-workspace-meta" role="status">{notice}</p>}
    {current && <p className="rb-workspace-meta">Grouped reports from the last 24 hours{checkedAt && <>
      {" · "}Last collected <time dateTime={checkedAt}>{stamp(checkedAt)}</time>
    </>}{current.coverage_truncated && " · Based on the latest 200 reports"}</p>}
    {current && !items.length && <p className="rb-workspace-meta">No recent reports in this snapshot.</p>}
    {items.length > 0 && <>
      <ol className="rb-discovery-list">
        {items.slice(0, visible).map(item => {
          const additional = item.reports.filter(report => report.url !== item.url);
          return <li key={item.id}>
            <h3><a href={item.url} target="_blank" rel="noreferrer">{item.title} <ArrowUpRight size={14} aria-hidden="true" /></a></h3>
            <p className="rb-discovery-times">{item.source} · <time dateTime={item.published_at}>{stamp(item.published_at)}</time></p>
            {additional.length > 0 && <details>
              <summary>{additional.length} more {additional.length === 1 ? "report" : "reports"} <ChevronDown size={13} aria-hidden="true" /></summary>
              <ul>{additional.map(report => <li key={report.id}>
                <a href={report.url} target="_blank" rel="noreferrer">{report.title} <ArrowUpRight size={12} aria-hidden="true" /></a>
                <p className="rb-workspace-meta">{report.source} · <time dateTime={report.published_at}>{stamp(report.published_at)}</time></p>
              </li>)}</ul>
            </details>}
          </li>;
        })}
      </ol>
      {items.length > visible && <button type="button" className="rb-workspace-action" onClick={() => setVisible(count => count + pageSize)}>Show more news</button>}
      <div className="rb-asset-news-tools">
        <DeferredDetails title="News map">
          <div className="rb-asset-news-map" data-lenis-prevent>
            <SignalField items={items.map(item => ({
              beat_label: asset.ticker, lede: item.title, url: item.url, source: item.source,
              published_at: item.published_at, corroboration: item.source_count > 1 ? item.source_count : undefined,
            }))} />
          </div>
        </DeferredDetails>
        <DeferredDetails title="Export news evidence">
          <AgentContextPanel topic={asset} snapshot={current} notice={notice} onRefresh={reload} loading={state === "loading"} />
        </DeferredDetails>
      </div>
    </>}
  </section>;
}
