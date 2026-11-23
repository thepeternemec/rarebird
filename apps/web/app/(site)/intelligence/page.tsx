import { SEED_BEATS } from "@rarebird/contracts";
import WorkspaceShell from "@/components/site/workspace-shell";
import FeedWorkspace from "@/components/site/feed-workspace";
import SignalInspector from "@/components/site/signal-inspector";
import OpportunityBrief from "@/components/site/opportunity-brief";
import MarketBriefingCard from "@/components/site/market-briefing";
import DeferredDetails from "@/components/site/deferred-details";
import "../landing.css";
import "../rarebird.css";
import "../rarebird-polish.css";
import "../quantitative.css";
import "./workspace.css";

export const metadata = {
  title: "Rarebird — Market checks",
  description: "Follow company and token feeds, read current evidence, and ask market questions in one conversation.",
  alternates: { canonical: "/intelligence" },
};

export default async function IntelligencePage({ searchParams }: {
  searchParams: Promise<{ beat?: string; market?: string }>;
}) {
  const query = await searchParams;
  const beat = typeof query.beat === "string" ? SEED_BEATS.find(item => item.beat_id === query.beat) : undefined;
  const asset = beat ? { beat_id: beat.beat_id, label: beat.label, ticker: beat.ticker, asset: beat.asset ?? "equity" } : null;
  const market = query.market === "equity" || query.market === "crypto" ? query.market : "all";

  return <WorkspaceShell active="/intelligence">
    <FeedWorkspace key={asset?.beat_id ?? market} asset={asset} market={market} unknownAsset={Boolean(query.beat && !asset)}>
      <div className="rb-feed-tools rb-market-workspace" aria-label="More market tools">
        <DeferredDetails title="Market briefing"><MarketBriefingCard showForecasts={false} /></DeferredDetails>
        <DeferredDetails id="opportunities" title="Reviews and filings"><OpportunityBrief /></DeferredDetails>
        <DeferredDetails id="real-signal" title="Asset inspector"><div className="ni-quant-workspace"><SignalInspector /></div></DeferredDetails>
      </div>
    </FeedWorkspace>
  </WorkspaceShell>;
}
