import { SEED_BEATS } from "@rarebird/contracts";

export function legacyMarketDestination(beatId: string | null | undefined, market: string | null | undefined) {
  const beat = beatId ? SEED_BEATS.find(item => item.beat_id === beatId) : undefined;
  if (beat) {
    return "/ask?" + new URLSearchParams({ ticker: beat.ticker, beat_id: beat.beat_id });
  }
  return market === "equity" || market === "crypto" ? "/app?market=" + market : "/app";
}
