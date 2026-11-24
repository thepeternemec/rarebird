export type WorkspaceMarket = "equity" | "crypto";

export const coinIdPattern = /^[a-z0-9][a-z0-9-]{0,99}$/;

export function forecastTickerFor(beatId: string) {
  if (beatId === "b_06c91290de1c") return "BTC";
  if (beatId === "b_edbc5b5af755") return "ETH";
}

export function workspaceMarketHref(market: WorkspaceMarket) {
  return market === "crypto" ? "/app?market=crypto" : "/app";
}

export function workspaceAssetHref(beatId: string) {
  return "/app?beat=" + encodeURIComponent(beatId);
}

export function workspaceCoinHref(coinId: string) {
  return "/app?coin=" + encodeURIComponent(coinId);
}

export function workspaceSearchHref(query: string, market: WorkspaceMarket = "equity") {
  const params = new URLSearchParams({ q: query });
  if (market === "crypto") params.set("market", "crypto");
  return "/app?" + params;
}
