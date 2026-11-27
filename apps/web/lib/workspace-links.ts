import { RESEARCH_HREF } from "./navigation";

export type WorkspaceMarket = "equity" | "crypto";

export const coinIdPattern = /^[a-z0-9][a-z0-9-]{0,99}$/;

export function forecastTickerFor(beatId: string) {
  if (beatId === "b_06c91290de1c") return "BTC";
  if (beatId === "b_edbc5b5af755") return "ETH";
}

export function workspaceMarketHref(market: WorkspaceMarket) {
  return market === "crypto" ? RESEARCH_HREF + "?market=crypto" : RESEARCH_HREF;
}

export function workspaceAssetHref(beatId: string) {
  return RESEARCH_HREF + "?beat=" + encodeURIComponent(beatId);
}

export function workspaceCoinHref(coinId: string) {
  return RESEARCH_HREF + "?coin=" + encodeURIComponent(coinId);
}

export function workspaceSearchHref(query: string, market: WorkspaceMarket = "equity") {
  const params = new URLSearchParams({ q: query });
  if (market === "crypto") params.set("market", "crypto");
  return RESEARCH_HREF + "?" + params;
}

/** Old /app research bookmarks keep their selection; tracking-only queries stay on the screener. */
export function legacyResearchHref(query: Record<string, string | string[] | undefined>) {
  if (!["beat", "market", "coin", "q"].some(key => {
    const value = query[key];
    return Array.isArray(value) ? value.some(Boolean) : Boolean(value);
  })) return null;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) value.forEach(item => params.append(key, item));
    else if (typeof value === "string") params.append(key, value);
  }
  return RESEARCH_HREF + "?" + params;
}
