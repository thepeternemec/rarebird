import { Hono } from "hono";
import { db, hasDatabaseEnv } from "@rarebird/db";
import { BtcPilotDatasetSchema, type BtcPilotDataset } from "@rarebird/contracts";
import { MOVE_RISK_VERSION, MOVE_THRESHOLD } from "./move-risk.js";

const INSTRUMENT = "kraken:XBTUSD";
const BTC_BEAT = "b_06c91290de1c";
const NEWS_LIMIT = 6000;
const iso = (value: unknown) => new Date(value as string).toISOString();

/** Bounded export of public BTC measurements. Reading never collects or trains. */
export async function readBtcPilotDataset(now = Date.now()): Promise<BtcPilotDataset> {
  const since = new Date(now - 30 * 86400000).toISOString();
  const output: BtcPilotDataset = {
    schema_version: "btc-kumo-dataset-v1", generated_at: new Date(now).toISOString(), status: "unavailable",
    instrument_id: INSTRUMENT, target: { horizon_minutes: 60, threshold_fraction: MOVE_THRESHOLD },
    baseline_version: MOVE_RISK_VERSION, coverage: { since, news_truncated: false, news_limit: NEWS_LIMIT },
    bars: [], news: [], forecasts: [],
  };
  if (!hasDatabaseEnv()) return output;
  const sql = db();
  const [bars, news, forecasts] = await Promise.all([
    sql.unsafe<Array<BtcPilotDataset["bars"][number]>>(
      "select started_at,observed_at,open_price as open,high_price as high,low_price as low,close_price as close,volume,trades from public.newsbeat_market_bars where instrument_id=$1 and started_at >= $2 and started_at+interval '5 minutes'<=$3 and observed_at<=$3 order by started_at limit 8641",
      [INSTRUMENT, since, output.generated_at]),
    sql.unsafe<Array<BtcPilotDataset["news"][number]>>(
      "select id::text,source,published_at,first_indexed_at from public.news_articles where beat_id=$1 and first_indexed_at >= $2 and first_indexed_at <= $3 and published_at <= $3 order by first_indexed_at desc,id desc limit $4",
      [BTC_BEAT, since, output.generated_at, NEWS_LIMIT + 1]),
    sql.unsafe<Array<BtcPilotDataset["forecasts"][number]>>(
      "select reference_at,issued_at,target_at,(forecast->>'reference_price_usd')::double precision as reference_price_usd,(forecast->>'probability')::double precision as probability,(forecast->>'baseline_probability')::double precision as baseline_probability,outcome,target_price_usd from public.newsbeat_market_forecasts where instrument_id=$1 and version=$2 and reference_at >= $3 and issued_at <= $4 order by reference_at limit 721",
      [INSTRUMENT, MOVE_RISK_VERSION, since, output.generated_at]),
  ]);
  return BtcPilotDatasetSchema.parse({
    ...output, status: bars.length && forecasts.length ? "ready" : "warming_up",
    coverage: { ...output.coverage, news_truncated: news.length > NEWS_LIMIT },
    bars: bars.map(row => ({ ...row, started_at: iso(row.started_at), observed_at: iso(row.observed_at) })),
    news: news.slice(0, NEWS_LIMIT).map(row => ({ ...row, published_at: iso(row.published_at), first_indexed_at: iso(row.first_indexed_at) })),
    forecasts: forecasts.map(row => ({ ...row, reference_at: iso(row.reference_at), issued_at: iso(row.issued_at), target_at: iso(row.target_at) })),
  });
}

export const btcPilotRoutes = new Hono();
btcPilotRoutes.get("/btc-pilot", async c => {
  c.header("Cache-Control", "no-store");
  try {
    const dataset = await readBtcPilotDataset();
    return c.json(dataset, dataset.status === "unavailable" ? 503 : 200);
  } catch (error) {
    console.warn("BTC pilot export unavailable", error instanceof Error ? error.name : "unknown");
    return c.json({ error: { code: "pilot_dataset_unavailable", message: "BTC experiment data is unavailable." } }, 503);
  }
});
