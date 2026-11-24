import WorkspaceShell, { WorkspaceEvidence } from "@/components/site/workspace-shell";
import ResearchQuestion from "@/components/site/research-question";
import DeferredDetails from "@/components/site/deferred-details";
import OpportunityBrief from "@/components/site/opportunity-brief";
import SignalInspector from "@/components/site/signal-inspector";

export const metadata = {
  title: "Market research questions | Rarebird",
  description: "Ask about a stock or crypto asset and inspect Rarebird’s answer, sources, uncertainty, and next checks.",
  alternates: { canonical: "/app/research" },
};

export default function ResearchPage() {
  return <WorkspaceShell active="/app/research" title="Ask a research question"
    description="Ask what changed, compare up to three assets, or check what evidence would change the outlook.">
    <WorkspaceEvidence title="How Rarebird builds an answer">
      <p>Rarebird identifies the assets, selects relevant reporting and checks available market measurements. The response links the sources and marks missing evidence.</p>
      <p>News research spans the catalog. Deeper measured checks cover six pilot assets.</p>
      <a href="/docs/try">See how to run the same question through the API</a>
    </WorkspaceEvidence>
    <ResearchQuestion />
    <DeferredDetails id="opportunities" title="Reviews and filings"><OpportunityBrief /></DeferredDetails>
    <DeferredDetails id="real-signal" title="Asset inspector"><SignalInspector /></DeferredDetails>
  </WorkspaceShell>;
}
