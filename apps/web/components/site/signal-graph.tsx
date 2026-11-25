"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  Activity, ArrowUpRight, Clock3, GitFork, Layers3, ScanLine,
} from "lucide-react";
import type { OpportunityBrief } from "@rarebird/api";
import SignalGraphScene, { type SignalNode, type SignalStage } from "./signal-graph-scene";
import "./signal-graph.css";

const STAGES = {
  anomaly: {
    name: "Anomaly", icon: Activity,
    title: "Spot a move that stands out.",
    description: "Rarebird looks for unusual moves after adjusting for a market benchmark. It checks closed 15-, 30- and 60-minute windows against earlier observations.",
    detail: "An unusual move starts a watch. Future scans check whether it persists or fades.",
    href: "/app/asset-inspector", link: "Inspect a market anomaly",
  },
  evidence: {
    name: "Evidence", icon: Layers3,
    title: "Trace the event to its source.",
    description: "Compare the move with time-stamped reporting and issuer filings. Evidence can support a possible explanation, contradict it, or leave the move unexplained.",
    detail: "Source links and timestamps let you check what was known at the time.",
    href: "/app", link: "Explore source evidence",
  },
  timing: {
    name: "Timing", icon: ScanLine,
    title: "Check the market reaction.",
    description: "The pilot checks relative moves, participation and trading costs alongside a fresh hypothesis about what changed.",
    detail: "Stale inputs, weak confirmation or thin liquidity can hold a review.",
    href: "/docs/intelligence#pilot-and-policy", link: "Read the review checks",
  },
  decision: {
    name: "Decision", icon: GitFork,
    title: "Review now or keep watching.",
    description: "Rarebird flags a review when the evidence and timing checks pass. It keeps an independently detected anomaly on watch when there’s no qualifying review.",
    detail: "A review records why it matters now, what could invalidate it, and what to check next.",
    href: "/app/research#opportunities", link: "See reviews and filings",
  },
  outcomes: {
    name: "Outcomes", icon: Clock3,
    title: "Measure what happened next.",
    description: "Rarebird records the starting reference for tracked anomalies and reviews, then checks measured outcomes at 15, 60 and 240 minutes.",
    detail: "The outcome record compares observed moves with a benchmark and shows when data was missing.",
    href: "/docs/intelligence#optional-numbers", link: "See how outcomes are tracked",
  },
} satisfies Record<SignalStage, {
  name: string; icon: typeof Activity; title: string; description: string; detail: string; href: string; link: string;
}>;
const ENDPOINT = `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api"}/v2/opportunities?limit=1`;
const dateTime = new Intl.DateTimeFormat(undefined, {
  month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
});

type Snapshot = {
  title: string;
  detail: string;
  asOf: string;
  coverage: string;
  branch: "review" | "watch" | "none";
};

type Pilot = { status: "idle" | "loading" | "failed" } | { status: "ready"; snapshot: Snapshot };

function summarize(brief: OpportunityBrief): Snapshot {
  if (!Array.isArray(brief.coverage) || !brief.coverage.length || !Array.isArray(brief.review)
    || !Array.isArray(brief.watch) || !Number.isFinite(Date.parse(brief.generated_at))) {
    throw new Error("Pilot snapshot is invalid");
  }
  const current = brief.coverage.filter(asset => asset.market === "current").length;
  const base = {
    asOf: brief.generated_at,
    coverage: `${current} of ${brief.coverage.length} assets had current market data`,
  };
  const review = brief.review.find(item => Date.parse(item.market_evidence_until) > Date.now());
  if (review) return {
    ...base, branch: "review", title: `${review.label} · Review now`,
    detail: `The recorded alert passed the reporting and timing checks. The market evidence expires at ${dateTime.format(new Date(review.market_evidence_until))}.`,
  };
  const watch = brief.watch[0];
  if (watch) return {
    ...base, branch: "watch", title: `${watch.label} · Keep watching`,
    detail: `A ${watch.minutes}-minute relative move stood out against ${watch.historical_windows} earlier windows. At the snapshot, it was an anomaly watch.`,
  };
  return {
    ...base, branch: "none",
    title: current ? "No qualifying candidates" : "Market data on hold",
    detail: current
      ? "No reviews or 30-minute anomaly watches were returned for this snapshot."
      : "The pilot didn’t have sufficiently current market evidence at the time of this snapshot.",
  };
}

export default function SignalGraph() {
  const uid = useId();
  const [selected, setSelected] = useState<SignalNode | "decision">("timing");
  const [pilot, setPilot] = useState<Pilot>({ status: "idle" });
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => {
    request.current?.abort();
    request.current = null;
  }, []);

  const stage = selected === "review" || selected === "watch" ? "decision" : selected;
  const info = STAGES[stage];
  const title = selected === "review" ? "The evidence is ready for review."
    : selected === "watch" ? "Track an unconfirmed move." : info.title;
  const description = selected === "review" ? "The evidence and timing checks passed. Inspect the source, the observed reaction and what would invalidate the signal."
    : selected === "watch" ? "A relative move stood out. Rarebird tracks whether it persists while it waits for evidence that qualifies for review." : info.description;
  const snapshot = pilot.status === "ready" ? pilot.snapshot : null;

  async function readPilot() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPilot({ status: "loading" });
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(ENDPOINT, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error("Pilot unavailable");
      const next = summarize(await response.json() as OpportunityBrief);
      if (request.current === controller) {
        setPilot({ status: "ready", snapshot: next });
        setSelected(current => current === selected ? (next.branch === "none" ? "decision" : next.branch) : current);
      }
    } catch {
      if (request.current === controller) setPilot({ status: "failed" });
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
          <p className="rb-signal-meta">{selected === "review" ? "Review now" : selected === "watch" ? "Keep watching" : info.name}</p>
          <h3>{title}</h3>
          <p className="rb-signal-description">{description}</p>
        </div>
        <p className="rb-signal-detail">{info.detail}</p>
        <a className="rb-home-text-link" href={info.href}>{info.link}<ArrowUpRight size={15} aria-hidden="true" /></a>
      </article>
    </div>
    <div className="rb-signal-live">
      <div className="rb-signal-live-text" aria-live="polite" aria-atomic="true">
        {snapshot ? <>
          <strong>{snapshot.title}</strong>
          <p>{snapshot.detail}</p>
          <p className="rb-signal-live-time"><time dateTime={snapshot.asOf}>{dateTime.format(new Date(snapshot.asOf))}</time> · {snapshot.coverage}</p>
        </> : <>
          <strong>Market pilot</strong>
          <p>{pilot.status === "loading" ? "Checking the latest market evidence…"
            : pilot.status === "failed" ? "The snapshot is unavailable. Try again."
              : "See the latest qualifying review or anomaly watch across the pilot assets."}</p>
        </>}
      </div>
      <div className="rb-signal-live-actions">
        <button type="button" onClick={() => void readPilot()} disabled={pilot.status === "loading"} aria-busy={pilot.status === "loading"}>
          {snapshot ? "Refresh snapshot" : "Check live pilot"}
          <ArrowUpRight size={15} aria-hidden="true" />
        </button>
        {snapshot && <a href="/app/research#opportunities">See reviews and filings</a>}
      </div>
    </div>
  </div>;
}
