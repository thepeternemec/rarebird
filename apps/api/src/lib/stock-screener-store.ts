import { randomUUID } from "node:crypto";
import { db, hasDatabaseEnv, type Sql } from "@rarebird/db";
import { STOCK_SCREENER_POLICY, STOCK_SCREENER_UNIVERSE, StockScreenerQuerySchema,
  type StockAlert, type StockBar, type StockFrame, type StockScreenEvent, type StockScreenResult, type StockScreenerFeed } from "@rarebird/contracts";
import { evolveStockAlert, screenStock, settleStockOutcomes } from "./stock-screener-engine.js";
import { fetchStockFrame, stockFeedConfig } from "./stock-screener-provider.js";
import { STOCK_SCREENER_SCHEMA } from "./stock-screener-schema.js";
import { deliverStockEvents, stockWebhookConfig } from "./stock-screener-delivery.js";

const decode = <T>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;
const json = (value: unknown) => JSON.parse(JSON.stringify(value));
const iso = (n: number) => new Date(n).toISOString();
const nextDue = (a: StockAlert) => a.outcomes.filter(o => o.status === "pending").map(o => o.due_at).sort()[0] ?? null;
type Snapshot = { at: string; mode: "scheduled" | "streaming"; session_open: boolean; coverage: StockScreenResult[] };
type Dependencies = { sql?: Sql; now?: () => number; frame?: StockFrame; fetchFrame?: typeof fetchStockFrame; deliver?: boolean };
const limitations = [
  "Four US shares, regular session only. SPY is the benchmark; no crypto or tokenized shares.",
  "A five-minute relative-strength screen with an intraday baseline; needs 66 aligned closed minutes after the open. Thresholds are experimental and are not calibrated return probabilities.",
  "IEX volume and quotes cover one exchange. SIP requires the appropriate market-data entitlement. Redistribution must follow your provider agreement.",
  "News is source-linked context known by detection time; it does not establish the cause of a price move.",
  "15/60-minute outcomes use observed bar closes and a frozen reference. The cost scenario subtracts 20 bp plus the entry spread; it is not a filled trade or a profit estimate.",
  "The event journal is retained for 30 days. Persist cursors and deduplicate event IDs. Webhook delivery is at least once and skips events older than five minutes.",
];
function coverageHold(reason: string): StockScreenResult[] { return STOCK_SCREENER_UNIVERSE.map(s => ({ ...s, state: "data_hold", reason, metrics: null })); }
export function visibleStockAlert(alert: StockAlert, now: number): StockAlert {
  if (alert.closed_at) return alert;
  if (now >= Date.parse(alert.expires_at)) return { ...alert, state: "expired", reason: "The setup lifetime has elapsed; waiting for the worker to record closure." };
  if (now >= Date.parse(alert.valid_until)) return { ...alert, state: "data_hold", reason: "The latest measurement is no longer current. Do not act on the old setup." };
  return alert;
}
function emptyFeed(now: number): StockScreenerFeed {
  const config = stockFeedConfig();
  return { generated_at: iso(now), policy: STOCK_SCREENER_POLICY, status: config.configured ? "warming_up" : "not_configured",
    message: config.configured ? "The stock feed is configured. Waiting for the first successful scan." : "Stock price feed is not connected yet. No stock setups have been measured.",
    benchmark: "SPY", source: { provider: "alpaca", feed: config.feed, coverage: config.coverage, mode: "scheduled", last_scan_at: null },
    delivery: { configured: stockWebhookConfig().configured, pending: 0, delivered: 0, failed: 0 }, universe: STOCK_SCREENER_UNIVERSE,
    coverage: coverageHold(config.configured ? "Waiting for the stock worker." : "Stock feed not connected."), active: [], recent: [], events: [], next_cursor: "0", has_more: false,
    evaluation: { observed: 0, pending: 0, missing: 0, mean_cost_scenario_bps: null }, limitations };
}
/** Stored, side-effect-free read for the app and agents. Never fetches prices or starts a worker. */
export async function readStockScreener(input: unknown = {}, options: { sql?: Sql; now?: number } = {}): Promise<StockScreenerFeed> {
  const query = StockScreenerQuerySchema.parse(input), now = options.now ?? Date.now(), output = emptyFeed(now);
  output.next_cursor = query.after ?? "0";
  if (!options.sql && !hasDatabaseEnv()) return { ...output, ...(stockFeedConfig().configured ? { status: "unavailable" as const, message: "Stock storage is not connected. Screening is on hold." } : {}) };
  try {
    const sql = options.sql ?? db(), params = [STOCK_SCREENER_POLICY, output.source.feed];
    const [workers, records, events, delivery, evaluation] = await Promise.all([
      sql.unsafe<Array<{ snapshot: unknown; last_error: string | null }>>("select snapshot,last_error from public.rarebird_stock_worker where id=$1", [output.source.feed]),
      sql.unsafe<Array<{ record: unknown }>>("select record from public.rarebird_stock_alerts where policy=$1 and feed=$2 order by created_at desc,id limit 80", params),
      query.after !== undefined
        ? sql.unsafe<Array<{ payload: unknown }>>("select payload from public.rarebird_stock_events where policy=$1 and feed=$2 and sequence>$3::bigint order by sequence limit $4", [...params, query.after, query.limit + 1])
        : sql.unsafe<Array<{ payload: unknown }>>("select payload from (select sequence,payload from public.rarebird_stock_events where policy=$1 and feed=$2 order by sequence desc limit $3) recent order by sequence", [...params, query.limit]),
      sql.unsafe<Array<{ status: string; count: string }>>("select o.status,count(*)::text from public.rarebird_stock_outbox o join public.rarebird_stock_events e on e.id=o.event_id where e.policy=$1 and e.feed=$2 group by o.status", params),
      sql.unsafe<Array<{ status: string; count: string; mean: number | null }>>(`select outcome->>'status' as status,count(*)::text,
        avg((outcome->>'cost_scenario_bps')::double precision) as mean from public.rarebird_stock_alerts,
        jsonb_array_elements(record->'outcomes') outcome where policy=$1 and feed=$2 and outcome->>'minutes'='15' group by outcome->>'status'`, params),
    ]);
    const snapshot = workers[0]?.snapshot ? decode<Snapshot>(workers[0].snapshot) : null;
    if (snapshot) {
      output.source.last_scan_at = snapshot.at; output.source.mode = snapshot.mode;
      const fresh = now - Date.parse(snapshot.at) <= 90000 && Date.parse(snapshot.at) <= now + 5000;
      if (!stockFeedConfig().configured) { /* A removed feed must not leave yesterday's scan looking live. */ }
      else if (!fresh || workers[0]?.last_error) {
        output.status = "data_hold"; output.message = "Stock screening is on hold because current market data is unavailable.";
      } else if (!snapshot.session_open) { output.status = "market_closed"; output.message = "The US regular trading session is closed. Screening resumes during the next session."; }
      else if (snapshot.coverage.every(c => c.state === "warming_up")) { output.status = "warming_up"; output.message = "Collecting today’s baseline. Screening starts after 66 aligned trading minutes."; }
      else if (snapshot.coverage.every(c => c.state === "data_hold" || c.state === "warming_up")) { output.status = "data_hold"; output.message = "Waiting for complete, current stock and benchmark measurements."; }
      else { output.status = "monitoring"; output.message = "Screening four US stocks for developing relative strength. An empty list means no setup passed the current rules."; }
      output.coverage = fresh && stockFeedConfig().configured && !workers[0]?.last_error ? snapshot.coverage : coverageHold(output.message);
    }
    output.recent = records.map(r => visibleStockAlert(decode<StockAlert>(r.record), now))
      .map(a => output.status !== "monitoring" && a.state === "active" ? { ...a, state: "data_hold", reason: output.message } : a);
    output.active = output.recent.filter(a => !a.closed_at && a.state !== "expired").map(a => output.status !== "monitoring" && a.state === "active" ? { ...a, state: "data_hold", reason: output.message } : a);
    const page = events.map(e => decode<StockScreenEvent>(e.payload));
    output.has_more = query.after !== undefined && page.length > query.limit;
    output.events = page.slice(0, query.limit);
    output.next_cursor = output.events.at(-1)?.sequence ?? output.next_cursor;
    for (const row of delivery) if (row.status === "pending" || row.status === "delivered" || row.status === "failed") output.delivery[row.status] = Number(row.count);
    for (const row of evaluation) {
      if (row.status === "observed" || row.status === "pending" || row.status === "missing") output.evaluation[row.status] = Number(row.count);
      if (row.status === "observed" && Number(row.count) >= 20) output.evaluation.mean_cost_scenario_bps = row.mean;
    }
    return output;
  } catch (error) {
    if ((error as { code?: string }).code !== "42P01") console.warn("stock screener read unavailable");
    return { ...output, ...(stockFeedConfig().configured ? { status: "unavailable" as const, message: "The stock worker has not established readable storage. Screening is on hold." } : {}) };
  }
}
async function saveAlert(sql: Sql, alert: StockAlert) {
  await sql.unsafe("insert into public.rarebird_stock_alerts(id,policy,feed,symbol,created_at,closed_at,next_due_at,record) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb) on conflict(id) do update set closed_at=excluded.closed_at,next_due_at=excluded.next_due_at,record=excluded.record", [alert.id, alert.policy, alert.feed, alert.symbol, alert.created_at, alert.closed_at, nextDue(alert), json(alert)]);
}
async function persistFrame(sql: Sql, frame: StockFrame, now: number) {
  for (const asset of Object.values(frame.instruments)) {
    const bars = asset.bars.filter(b => b.time + 60000 <= now && b.time > now - 24 * 3600000);
    await sql.unsafe(`insert into public.rarebird_stock_bars(feed,symbol,started_at,observed_at,bar)
      select $1,$2,to_timestamp(b.time/1000),to_timestamp(coalesce(b.observed_at,$4)/1000),to_jsonb(b)
      from jsonb_to_recordset($3::jsonb) as b(time double precision,open double precision,high double precision,low double precision,close double precision,volume double precision,observed_at double precision)
      on conflict(feed,symbol,started_at) do nothing`, [frame.feed, asset.symbol, json(bars), now]);
    const rows = await sql.unsafe<Array<{ bar: unknown; observed_at: Date }>>("select bar,observed_at from public.rarebird_stock_bars where feed=$1 and symbol=$2 and started_at>=to_timestamp($3)-interval '24 hours' order by started_at", [frame.feed, asset.symbol, now / 1000]);
    asset.bars = rows.map(r => ({ ...decode<StockBar>(r.bar), observed_at: new Date(r.observed_at).getTime() }));
  }
}
/** Explicit scheduled/stream worker, leased across processes. No LLM calls or trade endpoints. */
export async function runStockScreener(options: Dependencies = {}) {
  const config = stockFeedConfig();
  if (!config.configured && !options.frame && !options.fetchFrame) return { status: "not_configured", alerts: 0, events: 0 };
  if (!options.sql && !hasDatabaseEnv()) return { status: "storage_not_configured", alerts: 0, events: 0 };
  const sql = options.sql ?? db(), clock = options.now ?? Date.now, token = randomUUID(), started = clock(), feed = options.frame?.feed ?? config.feed;
  await sql.begin(async tx => { await tx.unsafe("select pg_advisory_xact_lock(hashtext('rarebird_stock_schema'))"); await tx.unsafe(STOCK_SCREENER_SCHEMA); });
  const lease = await sql.unsafe<Array<{ id: string }>>(`insert into public.rarebird_stock_worker(id,lease_token,lease_until) values($1,$2,to_timestamp($3)+interval '90 seconds')
    on conflict(id) do update set lease_token=excluded.lease_token,lease_until=excluded.lease_until
    where (rarebird_stock_worker.lease_until is null or rarebird_stock_worker.lease_until<to_timestamp($3))
      and ($4::boolean or rarebird_stock_worker.snapshot->>'mode' is distinct from 'streaming' or rarebird_stock_worker.last_error is not null or rarebird_stock_worker.last_scan_at<to_timestamp($3)-interval '90 seconds') returning id`, [feed, token, started / 1000, options.frame?.mode === "streaming"]);
  if (!lease.length) return { status: "leased", alerts: 0, events: 0 };
  let frame: StockFrame | null = null, error: string | null = null;
  try { frame = structuredClone(options.frame ?? await (options.fetchFrame ?? fetchStockFrame)(started)); }
  catch (e) { error = e instanceof Error && /^stock_[a-z_]+$/.test(e.message) ? e.message : "stock_feed_unavailable"; }
  const now = clock();
  let events = 0, alerts = 0;
  try {
    await sql.begin(async tx => {
      const owner = await tx.unsafe<Array<{ lease_token: string }>>("select lease_token from public.rarebird_stock_worker where id=$1 for update", [feed]);
      if (owner[0]?.lease_token !== token) throw new Error("stock_lease_lost");
      if (frame && frame.feed !== feed) throw new Error("stock_feed_changed");
      if (frame) await persistFrame(tx as unknown as Sql, frame, now);
      const coverage = frame ? STOCK_SCREENER_UNIVERSE.map(s => screenStock(frame!, s.symbol, now)) : coverageHold("The US-share feed is unavailable; the setup is on hold.");
      const pending = await tx.unsafe<Array<{ record: unknown }>>("select record from public.rarebird_stock_alerts where policy=$1 and feed=$2 and next_due_at<=to_timestamp($3) order by next_due_at limit 200", [STOCK_SCREENER_POLICY, feed, now / 1000]);
      for (const row of pending) {
        let record = decode<StockAlert>(row.record);
        if (frame) record = settleStockOutcomes(record, frame, now);
        record.outcomes = record.outcomes.map(o => o.status === "pending" && now > Date.parse(o.due_at) + 120000 ? { ...o, status: "missing" } : o);
        await saveAlert(tx as unknown as Sql, record);
      }
      for (const screen of coverage) {
        const previous = await tx.unsafe<Array<{ record: unknown }>>("select record from public.rarebird_stock_alerts where policy=$1 and feed=$2 and symbol=$3 order by created_at desc limit 1", [STOCK_SCREENER_POLICY, feed, screen.symbol]);
        const evolved = evolveStockAlert(previous[0] ? decode<StockAlert>(previous[0].record) : null, screen, now, feed, `stock_${randomUUID()}`);
        if (!evolved.alert) continue;
        const alert = evolved.alert;
        if (evolved.type === "created") {
          // Context was already in Rarebird before this decision. It is not a causal label.
          const evidence = await tx.savepoint(async evidenceTx => evidenceTx.unsafe<Array<{ title: string; url: string; source: string; published_at: Date; first_indexed_at: Date }>>("select title,url,source,published_at,first_indexed_at from public.news_articles where beat_id=$1 and published_at<=to_timestamp($2) and first_indexed_at<=to_timestamp($2) and published_at>to_timestamp($2)-interval '24 hours' and url ~ '^https?://' order by published_at desc limit 3", [alert.beat_id, now / 1000])).catch(() => []);
          alert.evidence = evidence.map(e => ({ title: e.title, url: e.url, source: e.source, published_at: new Date(e.published_at).toISOString(), known_at: new Date(e.first_indexed_at).toISOString() }));
          alerts++;
        }
        await saveAlert(tx as unknown as Sql, alert);
        if (evolved.type) {
          const event: StockScreenEvent = { id: `${alert.id}:${alert.version}`, sequence: "0", type: evolved.type, recorded_at: iso(now), alert };
          const inserted = await tx.unsafe<Array<{ sequence: string }>>("insert into public.rarebird_stock_events(id,alert_id,version,policy,feed,recorded_at,payload) values($1,$2,$3,$4,$5,$6,$7::jsonb) on conflict(alert_id,version) do nothing returning sequence::text", [event.id, alert.id, alert.version, alert.policy, feed, event.recorded_at, json(event)]);
          if (inserted[0]) {
            event.sequence = inserted[0].sequence;
            await tx.unsafe("update public.rarebird_stock_events set payload=$2::jsonb where id=$1", [event.id, json(event)]);
            const webhook = stockWebhookConfig();
            if (webhook.configured) await tx.unsafe("insert into public.rarebird_stock_outbox(event_id,destination_hash,next_attempt_at) values($1,$2,$3) on conflict do nothing", [event.id, webhook.destination_hash, iso(now)]);
            events++;
          }
        }
      }
      // A disconnected streaming process must allow the scheduled REST fallback to take over.
      const snapshot: Snapshot = { at: iso(now), mode: frame?.mode ?? "scheduled", session_open: frame?.session_open ?? true, coverage };
      if (!error && coverage.every(c => c.state === "data_hold") && frame?.session_open) error = "stock_measurements_unavailable";
      await tx.unsafe("update public.rarebird_stock_worker set snapshot=$3::jsonb,last_scan_at=$4,last_error=$5,lease_until=null,lease_token=null where id=$1 and lease_token=$2", [feed, token, json(snapshot), iso(now), error]);
      // Bound storage, preserving the 30-day replay window and evaluation records.
      await tx.unsafe("delete from public.rarebird_stock_bars where started_at<to_timestamp($1)-interval '2 days'", [now / 1000]);
      await tx.unsafe("delete from public.rarebird_stock_events where recorded_at<to_timestamp($1)-interval '30 days'", [now / 1000]);
      await tx.unsafe("delete from public.rarebird_stock_alerts where created_at<to_timestamp($1)-interval '30 days' and closed_at is not null", [now / 1000]);
    });
    if (options.deliver !== false) await deliverStockEvents(sql).catch(() => console.warn("stock notification delivery deferred"));
    return { status: error ? "data_hold" : "scanned", alerts, events };
  } finally {
    await sql.unsafe("update public.rarebird_stock_worker set lease_until=null,lease_token=null where id=$1 and lease_token=$2", [feed, token]);
  }
}
