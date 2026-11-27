import { redirect } from "next/navigation";
import WorkspaceShell from "@/components/site/workspace-shell";
import StockScreener from "@/components/site/stock-screener";
import { legacyResearchHref } from "@/lib/workspace-links";
import type { WorkspaceQuery } from "@/lib/workspace-selection";

export const metadata = {
  title: "Stock setups and performance record | Rarebird",
  description: "Inspect stock setups, evidence, delivery, expiry and forward observations.",
  alternates: { canonical: "/app/screener" },
};

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<WorkspaceQuery> }) {
  const research = legacyResearchHref(await searchParams);
  if (research) redirect(research);
  return <WorkspaceShell active="/app/screener"><StockScreener /></WorkspaceShell>;
}
