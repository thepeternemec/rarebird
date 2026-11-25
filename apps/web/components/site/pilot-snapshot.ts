import type { OpportunityBrief } from "@rarebird/api";

export type PilotSnapshot = {
  title: string;
  detail: string;
  asOf: string;
  coverage: string;
  notice: string | null;
  branch: "review" | "watch" | "none";
};

const dateTime = new Intl.DateTimeFormat(undefined, {
  month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
});

export function pilotCoverage(coverage: OpportunityBrief["coverage"]) {
  const total = coverage.length;
  const current = coverage.filter(asset => asset.market === "current").length;
  const analysis = coverage.filter(asset => asset.analysis === "ready").length;
  const reporting = coverage.filter(asset => asset.source_freshness === "fresh").length;
  const complete = coverage.filter(asset =>
    asset.market === "current" && asset.analysis === "ready" && asset.source_freshness === "fresh").length;
  const notices = [
    ...(analysis < total ? [`Analysis is not ready for ${total - analysis} of ${total} assets.`] : []),
    ...(reporting < total ? [`Reporting is not current for ${total - reporting} of ${total} assets.`] : []),
  ];
  return { total, current, analysis, complete, notice: notices.length ? notices.join(" ") : null };
}

export function summarizePilot(brief: OpportunityBrief, now = Date.now()): PilotSnapshot {
  if (!Array.isArray(brief?.coverage) || !brief.coverage.length || !Array.isArray(brief.review)
    || !Array.isArray(brief.watch) || !Number.isFinite(Date.parse(brief.generated_at))) {
    throw new Error("Pilot snapshot is invalid");
  }
  const { total, current, analysis, complete, notice } = pilotCoverage(brief.coverage);
  const base = {
    asOf: brief.generated_at,
    coverage: `${current} of ${total} assets have current market data`,
    notice,
  };
  const review = brief.review.find(item => Date.parse(item.market_evidence_until) > now);
  if (review) return {
    ...base, branch: "review", title: `${review.label} · Review now`,
    detail: `The recorded alert passed the reporting and timing checks. The market evidence expires at ${dateTime.format(new Date(review.market_evidence_until))}.`,
  };
  const watch = brief.watch[0];
  if (watch) return {
    ...base, branch: "watch", title: `${watch.label} · Keep watching`,
    detail: `A ${watch.minutes}-minute relative move stood out against ${watch.historical_windows} earlier windows. At the snapshot, it was an anomaly watch.`,
  };
  if (!current) return {
    ...base, branch: "none", title: "Market data on hold",
    detail: "The pilot does not have sufficiently current market evidence. Open the live pilot to inspect coverage and data holds.",
  };
  if (!analysis) return {
    ...base, branch: "none", title: "Signal analysis on hold",
    detail: "Market data is available, but the reporting analysis is not ready. An empty review list does not mean every asset passed its checks.",
  };
  if (complete < total) return {
    ...base, branch: "none", title: "Partial pilot coverage",
    detail: "No qualifying reviews or anomaly watches were returned. Some assets have held market data, analysis or reporting; open the pilot for the coverage details.",
  };
  return {
    ...base, branch: "none", title: "No qualifying candidates",
    detail: "The pilot returned no qualifying reviews or 30-minute anomaly watches with its current coverage.",
  };
}
