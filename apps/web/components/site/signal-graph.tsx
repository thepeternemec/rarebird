"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  Activity, ArrowUpRight, Clock3, GitFork, Layers3, RefreshCw, ScanLine,
} from "lucide-react";
import type { StockScreenerFeed } from "@rarebird/contracts";
import type { PilotSnapshot } from "./pilot-snapshot";
import { STOCK_PILOT_ENDPOINT, summarizeStockPilot } from "./stock-pilot-snapshot";
import SignalGraphScene, { type SignalNode, type SignalStage } from "./signal-graph-scene";
import "./signal-graph.css";

const STAGES = {
  anomaly: {
    name: "Anomaly", icon: Activity,
    title: "Spot a move that stands out.",
    description: "Rarebird checks five-minute stock strength against SPY, adjusted for the stock’s recent sensitivity to the market. The fit uses earlier closed minutes from the same session.",
    detail: "The first screen follows NVDA, AAPL, MSFT and GOOGL US shares during the regular session.",
    href: "/app/screener", link: "Inspect the stock screen",
  },
  evidence: {
    name: "Evidence", icon: Layers3,
    title: "Trace the event to its source.",
    description: "Recent reporting already known at detection stays attached to the setup, with source links and publication times. It can suggest a question to investigate; it does not establish the cause of a move.",
    detail: "Reporting is optional context. The measured stock screen can qualify without a news explanation.",
    href: "/app?market=equity", link: "Explore stock reporting",
  },
  timing: {
    name: "Timing", icon: ScanLine,
    title: "Check strength and participation.",
    description: "The stock must show relative strength and unusual traded volume with a reasonable spread. Already extended moves, old quotes and missing measurements cannot qualify as a fresh setup.",
    detail: "IEX covers one exchange; SIP requires entitlement. The screener always shows which feed is in use.",
    href: "/docs/connect#stock-screener", link: "Read the stock-screening guide",
  },
  decision: {
    name: "Decision", icon: GitFork,
    title: "Send the setup. Follow the change.",
    description: "A qualifying setup gets one stable ID. Your agent can read it through MCP or receive signed lifecycle events at a configured webhook. Continuation does not create duplicate alerts.",
    detail: "A setup can pause, resume, invalidate or expire. A read does not configure a notification destination.",
    href: "/docs/connect#stock-screener", link: "Connect your agent",
  },
  outcomes: {
    name: "Outcomes", icon: Clock3,
    title: "Measure what happened next.",
    description: "Each detected setup keeps its starting stock and SPY reference. Rarebird records forward observations at 15 and 60 minutes, including setups that later fail.",
    detail: "Missing observations stay missing. These are measured outcomes, not filled trades or demonstrated profits.",
    href: "/app/screener", link: "See setup history and outcomes",
  },
} satisfies Record<SignalStage, {
  name: string; icon: typeof Activity; title: string; description: string; detail: string; href: string; link: string;
}>;
const ENDPOINT = STOCK_PILOT_ENDPOINT;
const dateTime = new Intl.DateTimeFormat(undefined, {
  month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
});

type Pilot = {
  status: "idle" | "loading" | "failed" | "ready";
  snapshot: PilotSnapshot | null;
};

export default function SignalGraph() {
  const uid = useId();
  const [selected, setSelected] = useState<SignalNode | "decision">("timing");
  const [pilot, setPilot] = useState<Pilot>({ status: "idle", snapshot: null });
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => {
    request.current?.abort();
    request.current = null;
  }, []);

  const stage = selected === "review" || selected === "watch" ? "decision" : selected;
  const info = STAGES[stage];
  const title = selected === "review" ? "A stock setup passed the screen."
    : selected === "watch" ? "Keep screening for a qualifying setup." : info.title;
  const description = selected === "review" ? "Strength, volume and spread qualified together. Your agent gets the setup with its reference, linked context and expiry when delivery is configured."
    : selected === "watch" ? "A current scan can return no setup. Data holds, incomplete baselines and a closed session are shown separately; none is a quiet-market result." : info.description;
  const snapshot = pilot.snapshot;

  async function readPilot() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPilot(previous => ({ ...previous, status: "loading" }));
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(ENDPOINT, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error("Pilot unavailable");
      const next = summarizeStockPilot(await response.json() as StockScreenerFeed);
      if (request.current === controller) {
        setPilot({ status: "ready", snapshot: next });
        setSelected(current => current === selected ? (next.branch === "none" ? "decision" : next.branch) : current);
      }
    } catch {
      if (request.current === controller) setPilot(previous => ({ ...previous, status: "failed" }));
    } finally {
      window.clearTimeout(timeout);
      if (request.current === controller) request.current = null;
    }
  }

  return <div className="rb-signal-graph">
    <div className="rb-signal-main">
      <SignalGraphScene selected={selected} detailsId={`${uid}-details`} onSelect={setSelected} />
      <article className="rb-signal-inspector" id={`${uid}-details`} aria-live="polite">
        <div className="rb-signal-inspector-icon"><info.icon size={21} strokeWidth={1.45} aria-hidden="true" /></div>
        <div>
          <p className="rb-signal-meta">{selected === "review" ? "Alert your agent" : selected === "watch" ? "Keep watching" : info.name}</p>
          <h3>{title}</h3>
          <p className="rb-signal-description">{description}</p>
        </div>
        <p className="rb-signal-detail">{info.detail}</p>
        <a className="rb-home-text-link" href={info.href}>{info.link}<ArrowUpRight size={15} aria-hidden="true" /></a>
      </article>
    </div>
    <div className="rb-signal-live">
      <div className="rb-signal-live-text" id={`${uid}-pilot-status`} role="status" aria-live="polite" aria-atomic="true">
        {snapshot ? <>
          <strong>{snapshot.title}</strong>
          <p>{snapshot.detail}</p>
          {snapshot.notice && <p className="rb-signal-live-notice">{snapshot.notice}</p>}
          <p className="rb-signal-live-time"><time dateTime={snapshot.asOf}>{dateTime.format(new Date(snapshot.asOf))}</time> · {snapshot.coverage}</p>
        </> : <>
          <strong>Four-stock screener pilot</strong>
          <p>Open NVDA, AAPL, MSFT and GOOGL setups and feed status, or check a snapshot here.</p>
        </>}
        {pilot.status === "loading" && <p className="rb-signal-live-feedback">Checking the latest market evidence…</p>}
        {pilot.status === "failed" && <p className="rb-signal-live-feedback">{snapshot
          ? "The refresh failed. The previous snapshot is still shown with its check time. Try again or open the stock screener."
          : "The snapshot could not be loaded. Open the stock screener or try the preview again."}</p>}
      </div>
      <div className="rb-signal-live-actions">
        <a className="rb-signal-open-pilot" href="/app/screener">
          Check stock screener <ArrowUpRight size={15} aria-hidden="true" />
        </a>
        <button className="rb-signal-preview" type="button" onClick={() => void readPilot()} disabled={pilot.status === "loading"} aria-busy={pilot.status === "loading"} aria-controls={`${uid}-pilot-status`}>
          <RefreshCw size={14} aria-hidden="true" />
          {pilot.status === "loading" ? "Checking…"
            : pilot.status === "failed" ? "Retry snapshot"
              : snapshot ? "Refresh snapshot" : "Preview snapshot"}
        </button>
      </div>
    </div>
  </div>;
}
