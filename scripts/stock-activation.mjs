/** Read-only activation check. No secrets, collection, training or test notifications. */
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

export function stockActivation(screener, model, now = Date.now()) {
  const source = screener?.source ?? {}, worker = model?.model?.worker;
  const lastScan = Date.parse(source.last_scan_at ?? ""), lastSeen = Date.parse(worker?.last_seen_at ?? "");
  const sameCohort = screener?.universe_snapshot?.id === model?.universe_version && source.feed === model?.feed;
  const feedConfigured = !["not_configured", "unavailable"].includes(screener?.status) && model?.data_status === "available";
  const checks = {
    cohort: { ok: sameCohort && screener?.universe?.length > 0, securities: screener?.universe?.length ?? 0,
      feed: source.feed, universe_version: model?.universe_version },
    feed: { ok: feedConfigured, status: screener?.status ?? "unavailable" },
    detector: { ok: Number.isFinite(lastScan) && now - lastScan <= 90000 && lastScan <= now + 5000
        && ["monitoring", "warming_up", "market_closed"].includes(screener?.status),
      last_scan_at: source.last_scan_at ?? null, mode: source.mode ?? null },
    delivery: { ok: screener?.delivery?.configured === true, acknowledged: screener?.delivery?.delivered ?? 0,
      pending: screener?.delivery?.pending ?? 0, failed: screener?.delivery?.failed ?? 0 },
    model_worker: { ok: sameCohort && Number.isFinite(lastSeen) && now - lastSeen <= 180000 && lastSeen <= now + 5000
        && ["warming_up", "training", "scoring"].includes(worker?.state),
      state: worker?.state ?? "not_connected", last_seen_at: worker?.last_seen_at ?? null },
  };
  return { ready: Object.values(checks).every(check => check.ok), checks,
    training: model?.model?.training ?? null,
    predictions: { issued: model?.model?.issued ?? 0, observed: model?.model?.observed ?? 0, missing: model?.model?.missing ?? 0 },
    note: "Readiness checks configuration and current worker signals. A delivery acknowledgement and a forward outcome still require a real eligible setup." };
}

async function main() {
  const { values } = parseArgs({ options: { origin: { type: "string", default: "https://www.rarebird.network" }, json: { type: "boolean" } } });
  const origin = new URL(values.origin);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("Use an HTTPS origin without credentials, path or query");
  const read = async path => {
    const response = await fetch(new URL(path, origin), { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Read failed with HTTP ${response.status}`);
    return response.json();
  };
  const [screener, model] = await Promise.all([read("/api/v2/stock-screener"), read("/api/v2/stock-model")]);
  const result = stockActivation(screener, model);
  if (values.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(result.ready ? "Stock service configuration is ready." : "Stock activation has unfinished checks.");
    for (const [name, check] of Object.entries(result.checks)) console.log(`${check.ok ? "PASS" : "WAIT"} ${name} ${JSON.stringify(check)}`);
    console.log(`Training ${JSON.stringify(result.training)}`);
    console.log(result.note);
  }
  process.exitCode = result.ready ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error("Stock activation could not be checked. Verify the origin and public API availability."); process.exitCode = 1; });
}
