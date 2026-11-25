import type { StockScreenerFeed } from "@rarebird/contracts";
import type { PilotSnapshot } from "./pilot-snapshot";

export const STOCK_PILOT_ENDPOINT = `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api"}/v2/stock-screener`;

/** Landing previews describe the US-share screen, never the older xStock/crypto pilot. */
export function summarizeStockPilot(feed: StockScreenerFeed, now = Date.now()): PilotSnapshot {
  if (!feed || !Array.isArray(feed.coverage) || !Array.isArray(feed.active) || !Array.isArray(feed.universe)
    || !feed.universe.length || !feed.source || !feed.delivery || !Number.isFinite(Date.parse(feed.generated_at))) {
    throw new Error("Stock pilot snapshot is invalid");
  }
  const current = feed.coverage.filter(s => ["candidate", "quiet", "extended"].includes(s.state)).length;
  const base = { asOf: feed.generated_at, coverage: `${current} of ${feed.universe.length} stocks have current screening measurements`,
    notice: feed.delivery.configured ? "Agent webhook configured. Check delivery status in the screener." : "Agent webhook is not configured. Setups remain readable through MCP and REST." };
  const result = (title: string, detail: string, branch: PilotSnapshot["branch"] = "none"): PilotSnapshot => ({ ...base, title, detail, branch });
  if (feed.status === "not_configured") return result("Stock feed connection pending", "The US-share feed is not connected. No stock setups have been measured. This is not a quiet-market result.");
  if (feed.status === "unavailable" || feed.status === "data_hold") return result("Stock measurements on hold", feed.message);
  const scan = Date.parse(feed.source.last_scan_at ?? "");
  if (!Number.isFinite(scan) || now - scan > 90000 || scan > now + 5000) return result("Stock measurements on hold", "The latest stock scan is not current. Open the screener for source coverage and data holds.");
  if (feed.status === "market_closed") return result("US regular market closed", "Stock screening resumes during the next regular session. The source status stays visible in the screener.");
  if (feed.status === "warming_up") return result("Building today’s stock baseline", "The screen needs 66 aligned closed minutes from the regular session before it can qualify a setup.");
  if (feed.status !== "monitoring") return result("Stock measurements on hold", "A current screening state has not been established.");
  const setup = feed.active.find(a => a.state === "active" && !a.closed_at && Date.parse(a.valid_until) > now && Date.parse(a.expires_at) > now);
  if (setup) return result(`${setup.symbol} · Developing setup`, "Relative strength, volume and spread passed the screen. Inspect the current measurement and expiry before investigating.", "review");
  if (current < feed.universe.length) return result("Partial stock coverage", "No current qualifying setup was returned. Some stock measurements are held or still building their baseline.");
  return result("No qualifying stock setup", "Current stock measurements do not pass the setup rules. A price move by itself does not create an alert.", "watch");
}
