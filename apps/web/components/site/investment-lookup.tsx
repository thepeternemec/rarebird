"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Send } from "lucide-react";
import type { InvestmentBrief } from "@rarebird/contracts";
import { workspaceAssetHref } from "@/lib/workspace-links";
import type { LookupAsset } from "./landing-lookup-data";
import { API_BASE } from "./content";
import { ResearchDetails } from "./research-question";
import "./investment-lookup.css";

export default function TickerBrief({ asset }: { asset: LookupAsset }) {
  const [result, setResult] = useState<InvestmentBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const active = useRef<AbortController | null>(null);

  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  useEffect(() => {
    const deadline = result?.stance?.valid_until;
    if (!deadline) return;
    const timer = window.setTimeout(() => setExpired(true), Math.max(0, Date.parse(deadline) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [result]);

  async function lookup() {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 35000);
    setResult(null);
    setExpired(false);
    setError("");
    setLoading(true);
    try {
      const response = await fetch(API_BASE + "/v2/investment", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", signal: controller.signal,
        body: JSON.stringify({ ticker: asset.ticker, beat_id: asset.beat_id }),
      });
      if (!response.ok) throw new Error(response.status === 429 ? "Too many requests. Wait a moment before retrying." : "The brief is unavailable right now. Try again.");
      const next = await response.json() as InvestmentBrief;
      if (next.research?.version !== "question-research-v1" || !Array.isArray(next.research.evidence)
        || next.research.assets.length !== 1 || next.research.assets[0]?.beat_id !== asset.beat_id) {
        throw new Error("The brief could not be matched to this ticker.");
      }
      if (active.current === controller) setResult(next);
    } catch (cause) {
      if (active.current === controller) setError(controller.signal.aborted ? "The request timed out. Try again." : cause instanceof Error ? cause.message : "The brief is unavailable.");
    } finally {
      window.clearTimeout(timer);
      if (active.current === controller) setLoading(false);
    }
  }

  const stance = expired ? { label: "Wait for a fresh check", reason: "The market evidence window has expired. Refresh the brief for the latest stance." } : result?.stance;
  const shareLink = result && stance ? `https://t.me/share/url?${new URLSearchParams({
    url: "https://www.rarebird.network" + workspaceAssetHref(asset.beat_id) + "#brief",
    text: `Rarebird · ${asset.label} (${result.ticker})\n${new Date(result.generated_at).toISOString().slice(0, 16).replace("T", " ")} UTC\n${stance.label}\n${stance.reason}${!expired && result.stance?.valid_until ? `\nTiming evidence through ${result.stance.valid_until.slice(0, 16).replace("T", " ")} UTC` : ""}\n\n${result.research.answer?.answer ?? ""}`.slice(0, 1000),
  })}` : null;

  return <div className="investment-lookup">
    <div className="investment-field">
      <button type="button" disabled={loading} onClick={() => void lookup()}>
        {result ? "Refresh" : "Generate"} {asset.ticker} brief <ArrowRight size={17} aria-hidden="true" />
      </button>
    </div>

    <div aria-live="polite">
      {loading ? <p className="investment-progress" role="status">Checking current reporting, market data, and the investment case for {asset.ticker}…</p> : null}
      {error ? <p className="investment-progress" role="alert">{error}</p> : null}
    </div>

    {result ? <section className="investment-report" aria-labelledby="investment-result-title">
      <div className="investment-report-heading">
        <div><p className="investment-eyebrow">Investment brief</p><h2 id="investment-result-title">{asset.label} · {asset.ticker}</h2></div>
        <time className="investment-stamp" dateTime={result.generated_at}>{new Date(result.generated_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time>
      </div>
      {stance ? <div className="investment-stance"><h3>{stance.label}</h3><p>{stance.reason}</p>
        {!expired && result.stance?.valid_until ? <small>Timing evidence through {new Date(result.stance.valid_until).toLocaleTimeString()}</small> : null}
      </div> : null}
      {!expired && result.timing?.trigger ? <div className="investment-trigger">
        <a href={result.timing.trigger.url} target="_blank" rel="noreferrer">{result.timing.trigger.title} <ArrowUpRight size={14} aria-hidden="true" /></a>
        <p>{result.timing.trigger.source} · {new Date(result.timing.trigger.published_at).toLocaleString()}</p>
        {result.timing.invalidation ? <p>What would change the timing view · {result.timing.invalidation}</p> : null}
      </div> : null}
      <div className="research-question-result"><ResearchDetails result={result.research} showReasoning /></div>
      {shareLink ? <a className="investment-share" href={shareLink} target="_blank" rel="noreferrer"><Send size={16} aria-hidden="true" /> Share to Telegram</a> : null}
    </section> : null}
  </div>;
}
