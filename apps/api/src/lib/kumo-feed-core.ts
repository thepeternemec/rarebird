import { createHash } from "node:crypto";
import { CatalystSnapshotSchema, KumoFeedRecordSchema, SEED_BEATS, type IntelligenceSignal, type KumoFeedKind, type KumoFeedRecord } from "@rarebird/contracts";

const HOUR = 3_600_000;
const iso = (value: number) => new Date(value).toISOString();
export const feedHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const beats = new Map(SEED_BEATS.map(beat => [beat.beat_id, beat]));
const cryptoEntity = (ticker: string) => SEED_BEATS.find(beat => beat.asset === "crypto" && beat.ticker === ticker.toUpperCase())?.beat_id;
export function feedEntity(id: string): Pick<KumoFeedRecord, "entity_id" | "asset_class" | "categories"> {
  const beat = beats.get(id);
  return { entity_id: beat?.beat_id ?? id,
    asset_class: beat ? beat.asset === "crypto" ? "crypto" : "equity" : id.startsWith("chain:") ? "chain" : id.startsWith("coingecko:") || id.startsWith("symbol:") || id.startsWith("stablecoin:") ? "crypto" : "macro",
    categories: beat ? { ticker: beat.ticker, asset_name: beat.label } : {} };
}
export function sourceRecord(input: {
  id: string; kind: KumoFeedKind; entity: string; source: string; url: string;
  eventAt: string; availableAt: string; ttl: number; text?: string;
  values?: Record<string, number | null>; categories?: Record<string, string>; related?: string[];
}): KumoFeedRecord {
  const available = Math.max(Date.parse(input.eventAt), Date.parse(input.availableAt));
  return KumoFeedRecordSchema.parse({ id: input.id, kind: input.kind, ...feedEntity(input.entity),
    source: input.source.slice(0, 160), source_url: input.url, event_at: input.eventAt,
    available_at: iso(available), expires_at: iso(available + input.ttl), text: (input.text ?? "").slice(0, 4000),
    values: input.values ?? {}, categories: { ...feedEntity(input.entity).categories, ...input.categories }, related_ids: input.related ?? [] });
}
export function newsFeedRecord(row: { id: string; beat_id: string; title: string; source: string; url: string; published_at: string; first_indexed_at: string }) {
  return sourceRecord({ id: "news:" + row.id, kind: "news", entity: row.beat_id, source: row.source || "unknown", url: row.url,
    eventAt: row.published_at, availableAt: row.first_indexed_at, ttl: 24 * HOUR, text: row.title });
}
export function interpretationFeedRecord(signal: IntelligenceSignal, recordedAt: string) {
  const evidenceTime = Math.max(0, ...signal.evidence.map(e => Math.max(Date.parse(e.published_at), Date.parse(e.first_indexed_at ?? recordedAt))));
  const available = iso(Math.max(Date.parse(recordedAt), Date.parse(signal.updated_at), evidenceTime));
  return sourceRecord({ id: "interpretation:" + signal.id + ":" + signal.version, kind: "interpretation", entity: signal.beat_id,
    source: "rarebird:model", url: signal.evidence[0]?.url ?? "https://www.rarebird.network",
    eventAt: signal.updated_at, availableAt: available, ttl: 24 * HOUR,
    text: [signal.what_changed, ...signal.implications.map(i => i.hypothesis + " " + i.mechanism)].join(" "),
    categories: { event_id: signal.id, category: signal.category, event_state: signal.event_state, attention: signal.attention,
      affected_entities: signal.affected_entities.join(", ").slice(0, 300),
      channel: signal.market_assessment?.channel ?? "unclear", direction: signal.market_assessment?.direction ?? "unclear", basis: "model_inference" },
    related: signal.evidence.map(e => "news:" + e.id).slice(0, 20) });
}
/** An old disclosure only becomes usable when it is first captured locally. */
export function officialFeedRecords(raw: unknown, recordedAt: string): KumoFeedRecord[] {
  const parsed = CatalystSnapshotSchema.safeParse(raw);
  if (!parsed.success) return [];
  const snapshot = parsed.data;
  const common = { entity: snapshot.beat_id, source: "sec", availableAt: recordedAt, ttl: 7 * 24 * HOUR };
  return [
    ...snapshot.filings.map(f => sourceRecord({ ...common, id: "filing:" + snapshot.beat_id + ":" + f.id, kind: "filing",
      url: f.url, eventAt: f.accepted_at, text: f.description, categories: { form: f.form, accession: f.accession } })),
    ...snapshot.comparisons.map(c => sourceRecord({ ...common,
      id: "financial:" + snapshot.beat_id + ":" + c.metric + ":" + c.current.filing_id + ":" + feedHash(c).slice(0, 20),
      kind: "financial", url: c.current.url, eventAt: snapshot.checked_at, text: c.label,
      values: { current: c.current.value, previous: c.previous.value, change: c.change, change_percent: c.change_percent },
      categories: { metric: c.metric, period: c.period, unit: c.unit, method: c.method },
      related: ["filing:" + snapshot.beat_id + ":" + c.current.filing_id] })),
  ];
}
export type FeedEnvelope = { source: string; source_url: string; fetched_at: string; freshness: { status: string }; data: unknown };
export function snapshotFeedRecords(kind: KumoFeedKind, payload: FeedEnvelope, recordedAt: string): KumoFeedRecord[] {
  if (payload.freshness.status !== "fresh") return [];
  const records: KumoFeedRecord[] = [];
  const add = (entity: string, values: Record<string, number | null>, ttl: number, eventAt = payload.fetched_at, categories: Record<string, string> = {}) => {
    if (Date.parse(recordedAt) - Date.parse(eventAt) > ttl) return;
    const clean = Object.fromEntries(Object.entries(values).filter(([, value]) => value === null || Number.isFinite(value)));
    if (!Object.values(clean).some(value => value !== null)) return;
    records.push(sourceRecord({ id: kind + ":" + feedHash([kind, entity, payload.source, eventAt, clean, categories]), kind,
      entity, source: payload.source, url: payload.source_url, eventAt, availableAt: recordedAt, ttl, values: clean, categories }));
  };
  // Each adapter reads a fixed public provider shape. Malformed shapes fail independently in the collector.
  const data = payload.data as any;
  switch (kind) {
    case "funding":
      for (const r of data) add(cryptoEntity(r.symbol.replace(/USDT$/, "")) ?? "symbol:" + r.symbol,
        { rate: r.rate, annualised: r.annualised, mark_price: r.mark_price, open_interest: r.open_interest ?? null },
        HOUR, payload.fetched_at, { symbol: r.symbol });
      break;
    case "dex_volume": add("macro:dex", { total_24h_usd: data.total_24h_usd, change_24h: data.change_24h ?? null }, HOUR); break;
    case "stablecoins":
      add("macro:stablecoins", { circulating_usd: data.circulating_usd, assets_tracked: data.assets_tracked }, 2 * HOUR);
      for (const r of data.top) add(cryptoEntity(r.symbol) ?? "stablecoin:" + r.symbol,
        { circulating_usd: r.circulating_usd }, 2 * HOUR, payload.fetched_at, { symbol: r.symbol });
      break;
    case "sentiment": add("macro:crypto", { value: data.current.value, change: data.current.change ?? null },
      26 * HOUR, data.current.observed_at, { classification: data.current.classification }); break;
    case "tvl":
      add("macro:defi", { total_usd: data.total_usd, change: data.change ?? null }, HOUR);
      for (const r of data.chains) add("chain:" + r.name.toLowerCase(), { tvl_usd: r.tvl_usd }, HOUR);
      break;
    case "chain":
      if (data.ethereum) add("chain:ethereum", { block: data.ethereum.block, gas_gwei: data.ethereum.gas_gwei }, 20 * 60_000, data.ethereum.observed_at);
      if (data.solana) add("chain:solana", { slot: data.solana.slot }, 20 * 60_000, data.solana.observed_at);
      break;
    case "market_quote":
      for (const r of data.assets) add(cryptoEntity(r.symbol) ?? "coingecko:" + r.id,
        { price_usd: r.price_usd, market_cap_usd: r.market_cap_usd, volume_24h_usd: r.volume_24h_usd,
          change_1h: r.change_1h ?? null, change_24h: r.change_24h ?? null, change_7d: r.change_7d ?? null },
        20 * 60_000, r.observed_at ?? payload.fetched_at, { symbol: r.symbol });
      break;
  }
  return records;
}
