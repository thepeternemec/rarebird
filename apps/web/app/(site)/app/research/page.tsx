import WorkspaceShell from "@/components/site/workspace-shell";
import MarketWorkspace from "@/components/site/market-workspace";
import { featuredStocks, workspaceSelection, type WorkspaceQuery } from "@/lib/workspace-selection";
import "../../crypto/crypto.css";

export const metadata = {
  title: "Market research | Rarebird",
  description: "Search stocks and crypto, inspect original reporting and explore supporting market evidence.",
  alternates: { canonical: "/app/research" },
};

export default async function ResearchPage({ searchParams }: { searchParams: Promise<WorkspaceQuery> }) {
  const selection = workspaceSelection(await searchParams);
  return <WorkspaceShell active="/app/research">
    <MarketWorkspace selection={selection} featuredStocks={featuredStocks} />
  </WorkspaceShell>;
}
