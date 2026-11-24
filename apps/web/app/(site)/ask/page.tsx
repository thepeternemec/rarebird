import { permanentRedirect } from "next/navigation";
import { tickerWorkspaceHref, type WorkspaceQuery } from "@/lib/workspace-selection";

export default async function AskPage({ searchParams }: { searchParams: Promise<WorkspaceQuery> }) {
  permanentRedirect(tickerWorkspaceHref(await searchParams, "#brief"));
}
