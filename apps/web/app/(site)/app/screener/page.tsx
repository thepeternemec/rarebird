import WorkspaceShell from "@/components/site/workspace-shell";
import StockScreener from "@/components/site/stock-screener";

export const metadata = {
  title: "Stock screener | Rarebird",
  description: "S&P 500 stock setups with relative strength, participation, source evidence, explicit expiry and a forward record for agents.",
  alternates: { canonical: "/app/screener" },
};

export default function StockScreenerPage() {
  return <WorkspaceShell active="/app/screener"><StockScreener /></WorkspaceShell>;
}
