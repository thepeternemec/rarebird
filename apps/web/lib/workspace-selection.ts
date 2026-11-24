import { SEED_BEATS } from "@rarebird/contracts";
import type { LookupAsset } from "../components/site/landing-lookup-data";
import { coinIdPattern, workspaceAssetHref, workspaceMarketHref, workspaceSearchHref, type WorkspaceMarket } from "./workspace-links";

export type WorkspaceQuery = Record<string, string | string[] | undefined>;

const catalog = SEED_BEATS.map(({ beat_id, label, ticker, asset }): LookupAsset => ({
  beat_id, label, ticker, asset: asset ?? "equity",
}));
const byId = new Map(catalog.map(asset => [asset.beat_id, asset]));
const tickerKey = (ticker: string) => ticker.normalize("NFKC").trim().toUpperCase().replace(/^\$/, "").replace(/-([A-Z])$/, ".$1");
const featured = ["NVDA", "AAPL", "MSFT", "AMZN"];

export const featuredStocks = featured.flatMap(ticker => catalog.filter(asset => asset.asset === "equity" && asset.ticker === ticker));

export function workspaceSelection({ beat, market, coin, q }: WorkspaceQuery) {
  const asset = typeof beat === "string" ? byId.get(beat) : undefined;
  const coinId = !beat && typeof coin === "string" && coinIdPattern.test(coin) ? coin : undefined;
  const selectedMarket: WorkspaceMarket = (asset ? asset.asset === "crypto" : coinId || market === "crypto") ? "crypto" : "equity";
  return {
    asset, coinId, market: selectedMarket,
    query: typeof q === "string" ? q.trim().slice(0, 80) : "",
    unavailable: Boolean((beat || coin) && !asset && !coinId),
  };
}

export function tickerWorkspaceHref({ ticker, beat_id, market }: WorkspaceQuery, fragment = "") {
  const text = typeof ticker === "string" ? ticker.trim().slice(0, 80) : "";
  const scope = market === "crypto" || market === "equity" ? market : undefined;
  const key = tickerKey(text);
  const pinned = typeof beat_id === "string" ? byId.get(beat_id) : undefined;
  if (pinned && (!text || tickerKey(pinned.ticker) === key)) return workspaceAssetHref(pinned.beat_id) + fragment;
  if (!text) return workspaceMarketHref(scope ?? "equity");

  const matches = catalog.filter(asset => tickerKey(asset.ticker) === key && (!scope || asset.asset === scope));
  return matches.length === 1 ? workspaceAssetHref(matches[0]!.beat_id) + fragment : workspaceSearchHref(text, scope);
}
