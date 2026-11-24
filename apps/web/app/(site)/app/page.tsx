import WorkspaceShell from "@/components/site/workspace-shell";
import MarketWorkspace from "@/components/site/market-workspace";
import { featuredStocks, workspaceSelection, type WorkspaceQuery } from "@/lib/workspace-selection";
import "../crypto/crypto.css";

export const metadata = {
  title: "Stock and crypto workspace | Rarebird",
  description: "Find a stock or crypto ticker and see its news, price and source evidence together.",
  alternates: { canonical: "/app" },
};

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<WorkspaceQuery> }) {
  const selection = workspaceSelection(await searchParams);
  return <WorkspaceShell active="/app">
    <MarketWorkspace selection={selection} featuredStocks={featuredStocks} />
  </WorkspaceShell>;
}
