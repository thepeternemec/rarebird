import WorkspaceShell, { WorkspaceEvidence } from "@/components/site/workspace-shell";
import MarketDiscovery from "@/components/site/market-discovery";

export const metadata = {
  title: "News signals | Rarebird",
  description: "Follow stock and crypto developments with source links, price moves and evidence in one feed.",
  alternates: { canonical: "/app" },
};

export default function WorkspacePage() {
  return <WorkspaceShell active="/app">
    <div className="rb-news-home">
      <MarketDiscovery />
      <div id="how-it-works">
        <WorkspaceEvidence title="How Rarebird checks a signal">
          <p>Rarebird groups related reporting and records when the evidence arrived. Each signal links to its sources and suggests what to verify next.</p>
          <p>News and price moves are separate observations. Confirm what drove a move before drawing a conclusion.</p>
          <a href="/docs/intelligence">Read the methodology</a>
        </WorkspaceEvidence>
      </div>
    </div>
  </WorkspaceShell>;
}
