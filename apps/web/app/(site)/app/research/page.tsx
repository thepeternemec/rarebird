import WorkspaceShell from "@/components/site/workspace-shell";
import OpportunityBrief from "@/components/site/opportunity-brief";

export const metadata = {
  title: "Reviews and filings | Rarebird",
  description: "See which developments are ready for review and read recent SEC filings.",
  alternates: { canonical: "/app/research" },
};

export default function ReviewsPage() {
  return <WorkspaceShell active="/app/research" title="Reviews and filings">
    <OpportunityBrief />
  </WorkspaceShell>;
}
