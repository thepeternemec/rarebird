import { Hono } from "hono";
import { z } from "zod";
import { db, hasDatabaseEnv } from "@rarebird/db";
import { KumoFeedKindSchema, KumoFeedPageSchema, KumoFeedRecordSchema, type IntelligenceSignal, type KumoFeedKind, type KumoFeedPage, type KumoFeedRecord } from "@rarebird/contracts";
import { interpretationFeedRecord, newsFeedRecord, sourceRecord } from "./kumo-feed-core.js";
import { MARKET_PROFILES } from "./quant-market.js";

const DAY = 86_400_000;
const iso = (v: unknown) => new Date(v as string).toISOString();
const decode = (v: unknown): any => typeof v === "string" ? JSON.parse(v) : v;
const querySchema = z.object({ kind: KumoFeedKindSchema, limit: z.coerce.number().int().min(1).max(1000).default(1000),
  since: z.string().datetime().optional(), until: z.string().datetime().optional(), cursor: z.string().max(900).optional() }).strict();
const cursorSchema = z.object({ kind: KumoFeedKindSchema, since: z.string(), until: z.string(), at: z.string().datetime(), id: z.string().max(240) }).strict();

function baseQuery(kind: KumoFeedKind) {
  switch (kind) {
    case "news": return "select 'news:'||id::text as id,greatest(published_at,first_indexed_at) as available_at,to_jsonb(a) as payload from public.news_articles a";
    case "interpretation": return "select 'interpretation:'||r.event_id||':'||r.version::text as id,r.recorded_at as available_at,jsonb_build_object('signal',r.signal,'recorded_at',r.recorded_at) as payload from public.newsbeat_intelligence_revisions r";
    case "discovery": return "select 'discovery:'||id as id,greatest(published_at,recorded_at) as available_at,to_jsonb(d) as payload from public.newsbeat_discovery_observations d";
    case "market_bar": return "select 'market_bar:'||instrument_id||':'||extract(epoch from started_at)::bigint::text as id,observed_at as available_at,to_jsonb(b) as payload from public.newsbeat_market_bars b where started_at+interval '5 minutes'<=observed_at";
    default: return "select id,available_at,record as payload from public.newsbeat_kumo_feed_records where kind='" + kind + "'";
  }
}
function mapRecord(kind: KumoFeedKind, row: { id: string; available_at: unknown; payload: unknown }): KumoFeedRecord {
  const p = decode(row.payload);
  if (kind === "news") return newsFeedRecord({ ...p, id: String(p.id), published_at: iso(p.published_at), first_indexed_at: iso(p.first_indexed_at) });
  if (kind === "interpretation") return interpretationFeedRecord(decode(p.signal) as IntelligenceSignal, iso(p.recorded_at));
  if (kind === "discovery") {
    const o = decode(p.observation);
    return sourceRecord({ id: row.id, kind, entity: p.beat_id, source: o.evidence?.source ?? "rarebird:discovery",
      url: o.url ?? o.evidence?.url ?? "https://www.rarebird.network", eventAt: iso(p.published_at), availableAt: iso(row.available_at),
      ttl: 24 * 3_600_000, text: o.evidence?.title ?? o.title ?? "", categories: { evidence_type: p.evidence_type, category: o.kind ?? "other" } });
  }
  if (kind === "market_bar") {
    const profile = MARKET_PROFILES.find(profile => profile.id === p.instrument_id);
    return sourceRecord({ id: row.id, kind, entity: profile?.beat_id ?? p.instrument_id, source: "kraken",
      url: "https://pro.kraken.com", eventAt: iso(Date.parse(p.started_at) + 300_000), availableAt: iso(row.available_at), ttl: 3_600_000,
      values: { return: p.close_price / p.open_price - 1, range: (p.high_price - p.low_price) / p.open_price, volume: p.volume, trades: p.trades },
      categories: { instrument: p.instrument_id, ticker: profile?.ticker ?? "" } });
  }
  return KumoFeedRecordSchema.parse(p);
}

/** Bounded, snapshot-bound pagination across existing records and the immutable feed journal. */
export async function readKumoFeedPage(input: unknown, now = Date.now()): Promise<KumoFeedPage> {
  const q = querySchema.parse(input);
  let cursor: z.infer<typeof cursorSchema> | null = null;
  if (q.cursor) {
    try { cursor = cursorSchema.parse(JSON.parse(Buffer.from(q.cursor, "base64url").toString())); }
    catch { throw new Error("invalid_feed_cursor"); }
  }
  const until = q.until ?? cursor?.until ?? iso(now), since = q.since ?? cursor?.since ?? iso(Date.parse(until) - 30 * DAY);
  if (Date.parse(until) > now || Date.parse(since) < now - 31 * DAY || Date.parse(since) >= Date.parse(until)
    || Date.parse(until) - Date.parse(since) > 30 * DAY + 1000
    || (cursor && (cursor.kind !== q.kind || cursor.since !== since || cursor.until !== until
      || Date.parse(cursor.at) < Date.parse(since) || Date.parse(cursor.at) > Date.parse(until)))) throw new Error("invalid_feed_window");
  const page: KumoFeedPage = { schema_version: "kumo-feeds-v1", generated_at: iso(now), since, until, kind: q.kind,
    status: "unavailable", records: [], next_cursor: null, coverage: { retained_days: 30,
      source: ["news", "interpretation", "discovery", "market_bar"].includes(q.kind) ? "existing_observation_history" : "immutable_feed_journal", error: null } };
  if (!hasDatabaseEnv()) return page;
  try {
    const rows = await db().unsafe<Array<{ id: string; available_at: Date; payload: unknown }>>(
      "with records as (" + baseQuery(q.kind) + ") select id,available_at,payload from records where available_at >= $1 and available_at <= $2 and ($3::timestamptz is null or (available_at,id)<($3::timestamptz,$4::text)) order by available_at desc,id desc limit $5",
      [since, until, cursor?.at ?? null, cursor?.id ?? null, q.limit + 1]);
    const kept = rows.slice(0, q.limit);
    page.records = kept.map(row => mapRecord(q.kind, row)).filter(row => Date.parse(row.available_at) <= Date.parse(until));
    page.status = page.records.length ? "ready" : "warming_up";
    if (rows.length > q.limit && kept.length) {
      const last = kept[kept.length - 1]!;
      page.next_cursor = Buffer.from(JSON.stringify({ kind: q.kind, since, until, at: iso(last.available_at), id: last.id })).toString("base64url");
    }
    if (page.coverage.source === "immutable_feed_journal") {
      const health = await db().unsafe<Array<{ last_error: string | null }>>("select last_error from public.newsbeat_kumo_feed_health where kind=$1", [q.kind]);
      page.coverage.error = health[0]?.last_error ?? null;
    }
    return KumoFeedPageSchema.parse(page);
  } catch (error) {
    if ((error as { code?: string }).code === "42P01") return { ...page, status: "warming_up", coverage: { ...page.coverage, error: "not_yet_collected" } };
    throw error;
  }
}
export const kumoFeedRoutes = new Hono();
kumoFeedRoutes.get("/kumo-feeds", async c => {
  c.header("Cache-Control", "no-store");
  try {
    const page = await readKumoFeedPage(c.req.query());
    return c.json(page, page.status === "unavailable" ? 503 : 200);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof Error && /^invalid_feed_/.test(error.message))
      return c.json({ error: { code: "invalid_request", message: "Use a feed kind and a valid snapshot-bound cursor or 30-day time window." } }, 400);
    console.warn("Kumo feed export unavailable", error instanceof Error ? error.name : "unknown");
    return c.json({ error: { code: "feed_export_unavailable", message: "Feed observations are unavailable." } }, 503);
  }
});
