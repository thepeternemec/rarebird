import { workspaceAssetHref, workspaceMarketHref } from "./workspace-links";
import { workspaceSelection } from "./workspace-selection";

export function legacyMarketDestination(beatId: string | null | undefined, market: string | null | undefined) {
  const selection = workspaceSelection({ beat: beatId ?? undefined, market: market ?? undefined });
  if (selection.asset) return workspaceAssetHref(selection.asset.beat_id);
  return workspaceMarketHref(selection.market);
}
