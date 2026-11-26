import { db, hasDatabaseEnv, type Sql } from "@rarebird/db";
import { SP500_SNAPSHOT, STOCK_SCREENER_POLICY, type StockAlert, type StockModelStatus, type StockPrediction } from "@rarebird/contracts";
import { stockFeedConfig } from "./stock-screener-provider.js";
import { STOCK_SCREENER_SCHEMA } from "./stock-screener-schema.js";
import { z } from "zod";

export const STOCK_KUMO_TARGET = "positive_15m_cost_adjusted_relative_return" as const;
const decode = <T>(value: unknown): T => (typeof value === "string" ? JSON.parse(value) : value) as T;
const batchSchema = z.object({
  model_id: z.string().regex(/^kumo-stock-[a-f0-9]{16}$/),
  universe_version: z.literal(SP500_SNAPSHOT.id), feed: z.enum(["iex", "sip"]),
  training_cutoff: z.string().datetime(), trained_at: z.string().datetime(),
  baseline_probability: z.number().finite().min(0).max(1),
  predictions: z.array(z.object({ alert_id: z.string().regex(/^stock_[a-zA-Z0-9_-]{1,80}$/), probability: z.number().finite().min(0).max(1) }).strict()).max(1000),
}).strict();
export async function readStockModel(options: { sql?: Sql; dataset?: boolean; predictionIds?: string[]; now?: number } = {}) {
  const now = options.now ?? Date.now();
  const status: StockModelStatus = { status: "warming_up", target: STOCK_KUMO_TARGET, issued: 0, observed: 0, missing: 0, brier: null, baseline_brier: null };
  const result: { schema_version: string; generated_at: string; universe_version: string; feed: string; model: StockModelStatus; predictions: Record<string, StockPrediction>; setups?: StockAlert[]; truncated?: boolean } = {
    schema_version: "sp500-kumo-v1", generated_at: new Date(now).toISOString(), universe_version: SP500_SNAPSHOT.id,
    feed: stockFeedConfig().feed, model: status, predictions: {},
  };
  if (!options.sql && !hasDatabaseEnv()) return result;
  try {
    const sql = options.sql ?? db(), feed = stockFeedConfig().feed;
    const rows = await sql.unsafe<Array<{ record: unknown; prediction: unknown | null }>>(`select ${options.dataset ? "a.record" : "jsonb_build_object('id',a.id,'closed_at',a.closed_at,'outcomes',a.record->'outcomes')"} as record,p.prediction from public.rarebird_stock_alerts a
      left join public.rarebird_stock_predictions p on p.alert_id=a.id
      where a.policy=$1 and a.feed=$2 and a.created_at>=to_timestamp($3)-interval '30 days'
      and a.record->>'universe_version'=$4 order by a.created_at,a.id limit 10001`, [STOCK_SCREENER_POLICY, feed, now / 1000, SP500_SNAPSHOT.id]);
    const retained = rows.slice(0, 10000), requested = new Set(options.predictionIds);
    let modelLoss = 0, baselineLoss = 0;
    for (const row of retained) {
      const alert = decode<StockAlert>(row.record);
      if (!row.prediction) continue;
      const prediction = decode<StockPrediction>(row.prediction);
      status.issued++;
      const outcome = alert.outcomes.find(outcome => outcome.minutes === 15);
      if (outcome?.status === "missing") status.missing++;
      if (outcome?.status === "observed" && outcome.cost_scenario_bps !== null) {
        const label = outcome.cost_scenario_bps > 0 ? 1 : 0;
        status.observed++; modelLoss += (prediction.probability - label) ** 2; baselineLoss += (prediction.baseline_probability - label) ** 2;
      }
      if (requested.has(alert.id) || (!options.predictionIds && !alert.closed_at && now < Date.parse(prediction.valid_until))) result.predictions[alert.id] = prediction;
    }
    status.status = rows.length > 10000 ? "unavailable" : status.issued ? "shadow" : "warming_up";
    if (status.observed >= 20 && rows.length <= 10000) { status.brier = modelLoss / status.observed; status.baseline_brier = baselineLoss / status.observed; }
    if (options.dataset) { result.setups = retained.map(row => decode<StockAlert>(row.record)); result.truncated = rows.length > 10000; }
  } catch (error) {
    if ((error as { code?: string }).code !== "42P01") status.status = "unavailable";
  }
  return result;
}

/** Authenticated publication. The first prospective probability for an episode stays immutable. */
export async function publishStockPredictions(input: unknown, options: { sql?: Sql; now?: number } = {}) {
  const batch = batchSchema.parse(input), now = options.now ?? Date.now();
  if (batch.feed !== stockFeedConfig().feed || Date.parse(batch.training_cutoff) >= Date.parse(batch.trained_at)
      || Date.parse(batch.trained_at) > now + 5000 || now - Date.parse(batch.trained_at) > 86400000) throw new Error("stock_model_provenance_invalid");
  const sql = options.sql ?? db();
  return sql.begin(async tx => {
    await tx.unsafe("select pg_advisory_xact_lock(hashtext('rarebird_stock_schema'))"); await tx.unsafe(STOCK_SCREENER_SCHEMA);
    let inserted = 0, skipped = 0;
    const ids = batch.predictions.map(prediction => prediction.alert_id);
    if (new Set(ids).size !== ids.length) throw new Error("stock_prediction_duplicate");
    const alerts = await tx.unsafe<Array<{ record: unknown }>>("select record from public.rarebird_stock_alerts where id=any($1::text[]) for update", [ids]);
    const byId = new Map(alerts.map(row => { const alert = decode<StockAlert>(row.record); return [alert.id, alert]; }));
    for (const value of batch.predictions) {
      const alert = byId.get(value.alert_id);
      if (!alert || alert.policy !== STOCK_SCREENER_POLICY || alert.feed !== batch.feed || alert.universe_version !== batch.universe_version
          || alert.state !== "active" || alert.closed_at || now >= Date.parse(alert.valid_until) || now >= Date.parse(alert.expires_at)
          || Date.parse(batch.training_cutoff) >= Date.parse(alert.created_at) || now >= Date.parse(alert.outcomes[0]!.due_at)) { skipped++; continue; }
      const prediction: StockPrediction = { model_id: batch.model_id, engine: "kumo-engine", probability: value.probability,
        baseline_probability: batch.baseline_probability, target: STOCK_KUMO_TARGET, issued_at: new Date(now).toISOString(),
        valid_until: alert.valid_until, training_cutoff: batch.training_cutoff, universe_version: batch.universe_version };
      const insertedRows = await tx.unsafe("insert into public.rarebird_stock_predictions(alert_id,prediction) values($1,$2::jsonb) on conflict(alert_id) do nothing returning alert_id", [alert.id, JSON.parse(JSON.stringify(prediction))]);
      inserted += insertedRows.length;
    }
    return { inserted, skipped };
  });
}
