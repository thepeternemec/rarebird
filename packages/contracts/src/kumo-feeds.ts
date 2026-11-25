import { z } from "zod";

export const KUMO_FEEDS = ["news", "interpretation", "discovery", "filing", "financial", "market_bar", "market_book", "market_quote", "funding", "dex_volume", "stablecoins", "sentiment", "tvl", "chain"] as const;
export const KumoFeedKindSchema = z.enum(KUMO_FEEDS);
export type KumoFeedKind = z.infer<typeof KumoFeedKindSchema>;
const timestamp = z.string().datetime();

/** Public source observations only. Forecast outcomes belong to the target export. */
export const KumoFeedRecordSchema = z.object({
  id: z.string().min(1).max(240), kind: KumoFeedKindSchema,
  entity_id: z.string().min(1).max(160), asset_class: z.enum(["equity", "crypto", "macro", "chain"]),
  source: z.string().min(1).max(160), source_url: z.string().url(),
  event_at: timestamp, available_at: timestamp, expires_at: timestamp,
  text: z.string().max(4000),
  values: z.record(z.number().finite().nullable()), categories: z.record(z.string().max(300)),
  related_ids: z.array(z.string().max(240)).max(20),
}).strict().refine(row => Date.parse(row.available_at) >= Date.parse(row.event_at)
  && Date.parse(row.expires_at) > Date.parse(row.available_at), "Invalid information availability window");
export type KumoFeedRecord = z.infer<typeof KumoFeedRecordSchema>;

export const KumoFeedPageSchema = z.object({
  schema_version: z.literal("kumo-feeds-v1"), generated_at: timestamp,
  since: timestamp, until: timestamp, kind: KumoFeedKindSchema,
  status: z.enum(["ready", "warming_up", "unavailable"]),
  records: z.array(KumoFeedRecordSchema), next_cursor: z.string().nullable(),
  coverage: z.object({ retained_days: z.literal(30), source: z.string(), error: z.string().nullable() }),
});
export type KumoFeedPage = z.infer<typeof KumoFeedPageSchema>;
