import { z } from "zod";

const timestamp = z.string().datetime();
const price = z.number().positive().finite();
export const BtcPilotDatasetSchema = z.object({
  schema_version: z.literal("btc-kumo-dataset-v1"),
  generated_at: timestamp,
  status: z.enum(["ready", "warming_up", "unavailable"]),
  instrument_id: z.literal("kraken:XBTUSD"),
  target: z.object({ horizon_minutes: z.literal(60), threshold_fraction: z.literal(0.01) }),
  baseline_version: z.literal("spot-range-hourly-v1"),
  coverage: z.object({ since: timestamp, news_truncated: z.boolean(), news_limit: z.number().int().positive() }),
  bars: z.array(z.object({
    started_at: timestamp, observed_at: timestamp,
    open: price, high: price, low: price, close: price,
    volume: z.number().nonnegative().finite(), trades: z.number().int().nonnegative(),
  })),
  news: z.array(z.object({
    id: z.string(), source: z.string(), published_at: timestamp, first_indexed_at: timestamp,
  })),
  forecasts: z.array(z.object({
    reference_at: timestamp, issued_at: timestamp, target_at: timestamp, reference_price_usd: price,
    probability: z.number().min(0).max(1), baseline_probability: z.number().min(0).max(1),
    outcome: z.enum(["pending", "above", "at_or_below", "missing"]), target_price_usd: price.nullable(),
  })),
});
export type BtcPilotDataset = z.infer<typeof BtcPilotDatasetSchema>;
