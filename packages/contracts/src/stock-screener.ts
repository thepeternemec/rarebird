import { z } from "zod";
import { SEED_BEATS } from "./seed.js";
import { SP500_MEMBERS, SP500_SNAPSHOT } from "./sp500.js";
export { SP500_SNAPSHOT };

export const STOCK_SCREENER_POLICY = "stock-relative-strength-v1";
export const STOCK_SCREENER_UNIVERSE: readonly { symbol: string; label: string; beat_id: string; sector: string; cik: string }[] = SP500_MEMBERS.map(member => {
  const beat = SEED_BEATS.find(beat => beat.asset === "equity" && beat.ticker === member.symbol);
  return { ...member, beat_id: beat?.beat_id ?? "" };
});
export const STOCK_SCREENER_PILOT = STOCK_SCREENER_UNIVERSE.filter(stock => ["NVDA", "AAPL", "MSFT", "GOOGL"].includes(stock.symbol));
export type ScreenSymbol = (typeof STOCK_SCREENER_UNIVERSE)[number]["symbol"];
export const StockScreenerQuerySchema = z.object({
  alert_id: z.string().regex(/^stock_[a-zA-Z0-9_-]{1,80}$/).optional(),
  after: z.string().regex(/^\d{1,18}$/).optional(),
  limit: z.number().int().min(1).max(50).default(20),
}).strict();
export type StockFeed = "iex" | "sip";
export type ScreenState = "warming_up" | "data_hold" | "quiet" | "candidate" | "extended";
export interface StockBar {
  time: number; open: number; high: number; low: number; close: number; volume: number;
  observed_at?: number;
}
export interface StockQuote { time: number; bid: number; ask: number; bid_size: number; ask_size: number }
export interface StockInstrument {
  symbol: string; asset_class: "us_equity"; exchange: string; verified: boolean;
  bars: StockBar[]; quote: StockQuote | null;
}
export interface StockFrame {
  provider: "alpaca"; feed: StockFeed; mode: "scheduled" | "streaming";
  received_at: string; session_open: boolean; session_checked_at: string;
  instruments: Record<string, StockInstrument>;
}
export interface ScreenMetrics {
  measured_at: string; window_minutes: 5; price: number; benchmark_price: number;
  asset_return_bps: number; benchmark_return_bps: number; relative_return_bps: number;
  residual_z: number; relative_volume: number; spread_bps: number; beta: number;
  baseline_samples: number; baseline_end_at: string; quote_at: string;
}
export interface StockScreenResult {
  symbol: ScreenSymbol; label: string; beat_id: string; state: ScreenState;
  reason: string; metrics: ScreenMetrics | null;
}
export interface ScreenerEvidence {
  title: string; url: string; source: string; published_at: string; known_at: string;
}
export type StockAlertState = "active" | "data_hold" | "invalidated" | "expired";
export interface StockAlert {
  id: string; policy: typeof STOCK_SCREENER_POLICY; symbol: ScreenSymbol; label: string; beat_id: string;
  version: number; state: StockAlertState; created_at: string; updated_at: string;
  last_event_at?: string;
  universe_version?: string;
  prediction?: StockPrediction;
  valid_until: string; expires_at: string; closed_at: string | null; reason: string;
  feed: StockFeed; reference: ScreenMetrics; latest: ScreenMetrics;
  evidence: ScreenerEvidence[];
  outcomes: Array<{
    minutes: 15 | 60; due_at: string; status: "pending" | "observed" | "missing";
    measured_at: string | null; asset_return_bps: number | null;
    relative_return_bps: number | null; cost_scenario_bps: number | null;
  }>;
}
export interface StockScreenEvent {
  sequence: string; id: string; type: "created" | "updated" | "data_hold" | "invalidated" | "expired" | "measured";
  recorded_at: string; alert: StockAlert;
}
export interface StockEventDelivery {
  event_id: string;
  status: "pending" | "delivered" | "failed" | "skipped" | "not_queued";
  attempts: number;
  delivered_at: string | null;
}
export interface StockScreenerFeed {
  generated_at: string; policy: typeof STOCK_SCREENER_POLICY;
  status: "not_configured" | "warming_up" | "market_closed" | "monitoring" | "data_hold" | "unavailable";
  message: string; benchmark: "SPY";
  source: { provider: "alpaca"; feed: StockFeed; coverage: string; mode: "scheduled" | "streaming"; last_scan_at: string | null };
  delivery: { configured: boolean; pending: number; delivered: number; failed: number; skipped?: number };
  universe_snapshot?: typeof SP500_SNAPSHOT;
  model?: StockModelStatus;
  universe: readonly { symbol: string; label: string; beat_id: string }[];
  coverage: StockScreenResult[]; active: StockAlert[]; recent: StockAlert[]; events: StockScreenEvent[];
  event_delivery?: StockEventDelivery[];
  next_cursor: string; has_more: boolean;
  evaluation: { observed: number; pending: number; missing: number; mean_cost_scenario_bps: number | null;
    cohort?: { feed: StockFeed; policy: string; horizon_minutes: 15; retention_days: 30; from: string; to: string };
  };
  limitations: string[];
}

export interface StockPrediction {
  model_id: string; engine: "kumo-engine"; probability: number; baseline_probability: number;
  issued_at: string; valid_until: string; target: "positive_15m_cost_adjusted_relative_return";
  training_cutoff: string; universe_version: string;
}
export interface StockModelStatus {
  status: "warming_up" | "shadow" | "unavailable";
  target: StockPrediction["target"];
  issued: number; observed: number; missing: number;
  brier: number | null; baseline_brier: number | null;
}
