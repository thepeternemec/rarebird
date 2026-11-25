import { randomUUID } from "node:crypto";
import { db } from "@rarebird/db";
import { type KumoFeedKind, type KumoFeedRecord } from "@rarebird/contracts";
import { chainPulse } from "./chain.js";
import { chainTvl, cryptoMarkets, fearGreed } from "./market.js";
import { dexVolume, fundingRates, stablecoinSupply } from "./signals.js";
import { feedHash, officialFeedRecords, snapshotFeedRecords, sourceRecord, type FeedEnvelope } from "./kumo-feed-core.js";
import { MARKET_PROFILES } from "./quant-market.js";

export const KUMO_FEED_SCHEMA = [
  "create table if not exists public.newsbeat_kumo_feed_records (id text primary key,kind text not null,available_at timestamptz not null,record jsonb not null);",
  "create index if not exists newsbeat_kumo_feed_kind_time_idx on public.newsbeat_kumo_feed_records(kind,available_at desc,id desc);",
  "create index if not exists newsbeat_kumo_feed_retention_idx on public.newsbeat_kumo_feed_records(available_at);",
  "create table if not exists public.newsbeat_kumo_feed_health (kind text primary key,last_attempt_at timestamptz not null,last_success_at timestamptz,last_error text);",
  "create table if not exists public.newsbeat_kumo_feed_worker (id text primary key,token text,lease_until timestamptz);",
].join("\n");
export type FeedFetcher = { kind: KumoFeedKind; fetch: () => Promise<FeedEnvelope> };
export const kumoFeedFetchers: FeedFetcher[] = [
  { kind: "funding", fetch: fundingRates }, { kind: "dex_volume", fetch: dexVolume },
  { kind: "stablecoins", fetch: stablecoinSupply }, { kind: "sentiment", fetch: () => fearGreed(2) },
  { kind: "tvl", fetch: () => chainTvl(12) }, { kind: "chain", fetch: chainPulse },
  { kind: "market_quote", fetch: cryptoMarkets },
];

/** Authenticated scheduled collection. Public graph exports never fetch upstreams. */
export async function runKumoFeedCollection(fetchers: FeedFetcher[] = kumoFeedFetchers) {
  const sql = db(), token = randomUUID();
  await sql.begin(async tx => {
    await tx.unsafe("select pg_advisory_xact_lock(hashtext('newsbeat_kumo_feed_schema'))");
    await tx.unsafe(KUMO_FEED_SCHEMA);
  });
  const lease = await sql.unsafe<Array<{ id: string }>>("insert into public.newsbeat_kumo_feed_worker(id,token,lease_until) values('feeds',$1,now()+interval '3 minutes') on conflict(id) do update set token=excluded.token,lease_until=excluded.lease_until where newsbeat_kumo_feed_worker.lease_until<now() or newsbeat_kumo_feed_worker.lease_until is null returning id", [token]);
  if (!lease.length) return { status: "leased", records: 0, feeds: [] };
  try {
    const fetched = await Promise.allSettled(fetchers.map(f => f.fetch()));
    let inserted = 0;
    const feeds: Array<{ kind: KumoFeedKind; status: string; records: number }> = [];
    await sql.begin(async tx => {
      const owner = await tx.unsafe<Array<{ token: string }>>("select token from public.newsbeat_kumo_feed_worker where id='feeds' for update");
      if (owner[0]?.token !== token) throw new Error("lease_lost");
      const [clock] = await tx.unsafe<Array<{ at: Date }>>("select clock_timestamp() as at");
      const recordedAt = clock!.at.toISOString();
      const save = async (kind: KumoFeedKind, records: KumoFeedRecord[], error: string | null) => {
        let captured = 0;
        for (const record of records) {
          if (Date.parse(record.available_at) > Date.parse(recordedAt)) continue;
          const rows = await tx.unsafe<Array<{ id: string }>>("insert into public.newsbeat_kumo_feed_records(id,kind,available_at,record) values($1,$2,$3,$4::jsonb) on conflict(id) do nothing returning id", [record.id, record.kind, record.available_at, JSON.stringify(record)]);
          inserted += rows.length;
          captured++;
        }
        const reason = error ?? (captured ? null : "warming_up");
        await tx.unsafe("insert into public.newsbeat_kumo_feed_health(kind,last_attempt_at,last_success_at,last_error) values($1,$2,case when $3::text is null then $2::timestamptz else null end,$3) on conflict(kind) do update set last_attempt_at=excluded.last_attempt_at,last_success_at=coalesce(excluded.last_success_at,newsbeat_kumo_feed_health.last_success_at),last_error=excluded.last_error", [kind, recordedAt, reason]);
        feeds.push({ kind, status: reason ?? "ready", records: captured });
      };
      for (let index = 0; index < fetchers.length; index++) {
        const kind = fetchers[index]!.kind, result = fetched[index]!;
        let records: KumoFeedRecord[] = [], error: string | null = null;
        try {
          if (result.status === "fulfilled") records = snapshotFeedRecords(kind, result.value, recordedAt);
          else error = "source_unavailable";
        } catch { error = "source_invalid"; }
        await save(kind, records, error ?? (records.length ? null : "stale_or_empty"));
      }
      const officials = await tx.unsafe<Array<{ snapshot: unknown }>>("select snapshot from public.newsbeat_official_evidence where snapshot is not null and last_error is null");
      const filings = officials.flatMap(row => officialFeedRecords(typeof row.snapshot === "string" ? JSON.parse(row.snapshot) : row.snapshot, recordedAt));
      for (const kind of ["filing", "financial"] as const) await save(kind, filings.filter(r => r.kind === kind), null);
      const markets = await tx.unsafe<Array<{ instrument_id: string; snapshot: any }>>("select instrument_id,snapshot from public.newsbeat_market_sources where snapshot is not null and last_error is null");
      const books: KumoFeedRecord[] = [];
      for (const row of markets) {
        const snapshot = typeof row.snapshot === "string" ? JSON.parse(row.snapshot) : row.snapshot;
        const book = snapshot.book, profile = MARKET_PROFILES.find(p => p.id === row.instrument_id);
        if (!book || !profile || Date.parse(recordedAt) - Date.parse(book.observed_at) > 15 * 60_000) continue;
        books.push(sourceRecord({ id: "market_book:" + feedHash([row.instrument_id, book]), kind: "market_book",
          entity: profile.beat_id ?? row.instrument_id, source: "kraken", url: snapshot.instrument.source_url,
          eventAt: book.observed_at, availableAt: recordedAt, ttl: 20 * 60_000,
          values: { mid: book.mid, spread_bps: book.spread_bps, bid_depth_usd: book.bid_depth_usd, ask_depth_usd: book.ask_depth_usd, imbalance: book.imbalance, buy_impact_bps: book.buy_impact_bps ?? null, sell_impact_bps: book.sell_impact_bps ?? null },
          categories: { instrument: row.instrument_id, ticker: profile.ticker } }));
      }
      await save("market_book", books, null);
      await tx.unsafe("delete from public.newsbeat_kumo_feed_records where available_at < now()-interval '30 days'");
      await tx.unsafe("update public.newsbeat_kumo_feed_worker set token=null,lease_until=null where id='feeds' and token=$1", [token]);
    });
    return { status: feeds.some(f => f.status !== "ready") ? "partial" : "ready", records: inserted, feeds };
  } catch (error) {
    await sql.unsafe("update public.newsbeat_kumo_feed_worker set token=null,lease_until=null where id='feeds' and token=$1", [token]);
    throw error;
  }
}
