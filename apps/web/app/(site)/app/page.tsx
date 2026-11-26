import WorkspaceShell from "@/components/site/workspace-shell";
import StockScreener from "@/components/site/stock-screener";
import MarketWorkspace from "@/components/site/market-workspace";
import { featuredStocks, workspaceSelection, type WorkspaceQuery } from "@/lib/workspace-selection";
import "../crypto/crypto.css";

export const metadata = {
  title: "Stock setups and performance record | Rarebird",
  description: "Inspect stock setups, evidence, delivery, expiry and forward observations.",
  alternates: { canonical: "/app" },
};

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<WorkspaceQuery> }) {
  const query = await searchParams;
  if (!Object.values(query).some(value => Array.isArray(value) ? value.length > 0 : Boolean(value))) {
    return <WorkspaceShell active="/app/screener"><StockScreener /></WorkspaceShell>;
  }
  const selection = workspaceSelection(query);
  return <WorkspaceShell active="/app">
    <MarketWorkspace selection={selection} featuredStocks={featuredStocks} />
  </WorkspaceShell>;
}
