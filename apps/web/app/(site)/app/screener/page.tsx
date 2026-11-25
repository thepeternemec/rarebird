import WorkspaceShell from "@/components/site/workspace-shell";
import StockScreener from "@/components/site/stock-screener";

export const metadata = {
  title: "Stock screener | Rarebird",
  description: "Developing setups in NVIDIA, Apple, Microsoft and Alphabet. Relative strength, participation, source context and a clear alert lifecycle for agents.",
  alternates: { canonical: "/app/screener" },
};

export default function StockScreenerPage() {
  return <WorkspaceShell active="/app/screener"><StockScreener /></WorkspaceShell>;
}
