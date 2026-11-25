/** Illustration data only; never used by a market-data or screening path. */
export const ACTIVITY_STOCKS = [
  { symbol: "NVDA", name: "NVIDIA" }, { symbol: "AAPL", name: "Apple" },
  { symbol: "MSFT", name: "Microsoft" }, { symbol: "GOOGL", name: "Alphabet" },
] as const;
export const ACTIVITY_CHECKS = ["Strength", "Volume", "Spread"] as const;
export const ACTIVITY_COLUMNS = 30;
export const ACTIVITY_STEPS = [
  { name: "Screen", title: "Keep checking the stocks.",
    description: "Rarebird compares each stock with SPY, a broad US-market benchmark. It also checks traded volume and the spread between buying and selling prices.",
    note: "Most checks lead to no alert. That is a useful result.", status: "Screening", column: 16 },
  { name: "Qualify", title: "Wait for the checks to agree.",
    description: "The stock must show unusual strength and trading activity, with a reasonable spread. A move that is already extended is held back.",
    note: "In this example, all three checks align for the highlighted stock.", status: "Setup detected", column: 24 },
  { name: "Notify", title: "Give your agent a reason to look.",
    description: "The setup includes the stock, why it qualified, its reference measurements and any recent source-linked reporting. A configured webhook delivers the event to your agent.",
    note: "MCP also lets your agent read the same setup and follow its changes.", status: "Agent update", column: 24 },
  { name: "Follow", title: "Keep the ending in the story.",
    description: "If the conditions fade, Rarebird invalidates the setup. Missing data puts it on hold. Later observations record what happened after 15 and 60 minutes.",
    note: "One setup keeps one ID. Updates do not become duplicate alerts.", status: "Setup invalidated", column: 29 },
] as const;

export function activityLevel(asset: number, check: number, column: number, selectedAsset: number): 0 | 1 | 2 | 3 {
  if (asset === selectedAsset && column >= 22 && column <= 26) return check === 2 || column >= 24 ? 3 : 2;
  const seed = (asset * 41 + check * 17 + column * 11) % 31;
  if (check === 2) return seed < 11 ? 1 : seed > 26 ? 2 : 0;
  return seed > 27 ? 2 : seed > 17 ? 1 : 0;
}
