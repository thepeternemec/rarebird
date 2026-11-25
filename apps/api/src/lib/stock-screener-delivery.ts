import { createHash, createHmac, randomUUID } from "node:crypto";
import type { Sql } from "@rarebird/db";

/** A single operator-configured destination; no unauthenticated URL registration. */
export function stockWebhookConfig() {
  const url = process.env.RAREBIRD_STOCK_SCREENER_WEBHOOK_URL;
  const secret = process.env.RAREBIRD_STOCK_SCREENER_WEBHOOK_SECRET;
  let valid = false;
  try {
    const parsed = new URL(url ?? "");
    const host = parsed.hostname.toLowerCase();
    valid = parsed.protocol === "https:" && !parsed.username && !parsed.password && (!parsed.port || parsed.port === "443")
      && host.includes(".") && !host.endsWith(".local") && !host.endsWith(".internal") && !host.endsWith(".localhost")
      && !/^[\d.]+$/.test(host) && !host.includes(":");
  } catch { /* Disabled until the operator provides a valid public HTTPS destination. */ }
  return { url, secret, configured: Boolean(valid && secret && secret.length >= 32),
    destination_hash: url ? createHash("sha256").update(url).digest("hex") : "" };
}
export function stockWebhookSignature(secret: string, timestamp: string, body: string) {
  return "v1=" + createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}
/** Durable, leased, at-least-once delivery. Receivers deduplicate X-Rarebird-Event-ID. */
export async function deliverStockEvents(sql: Sql, options: { fetcher?: typeof fetch; now?: () => number } = {}) {
  const config = stockWebhookConfig();
  if (!config.configured) return { delivered: 0, failed: 0 };
  const clock = options.now ?? Date.now, token = randomUUID();
  const rows = await sql.unsafe<Array<{ event_id: string; attempts: number; destination_hash: string; payload: unknown; recorded_at: Date; current: unknown }>>(`
    with claim as (
      select event_id from public.rarebird_stock_outbox
      where status='pending' and next_attempt_at<=to_timestamp($1)
        and (lease_until is null or lease_until<to_timestamp($1))
      order by next_attempt_at limit 8 for update skip locked
    ), leased as (
      update public.rarebird_stock_outbox o set lease_token=$2,lease_until=to_timestamp($1)+interval '90 seconds'
      from claim where o.event_id=claim.event_id returning o.*
    ) select l.*,e.payload,e.recorded_at,a.record as current from leased l join public.rarebird_stock_events e on e.id=l.event_id
      join public.rarebird_stock_alerts a on a.id=e.alert_id order by e.sequence`, [clock() / 1000, token]);
  let delivered = 0, failed = 0;
  // Retries may arrive after a newer version. Receivers retain the greatest alert version.
  for (const row of rows) {
    const now = clock();
    const event = (typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload) as { type: string };
    const current = (typeof row.current === "string" ? JSON.parse(row.current) : row.current) as { state: string; valid_until: string };
    const obsolete = ["created", "updated"].includes(event.type) && (current.state !== "active" || now >= Date.parse(current.valid_until));
    if (obsolete || row.destination_hash !== config.destination_hash || now - new Date(row.recorded_at).getTime() > 5 * 60000) {
      await sql.unsafe("update public.rarebird_stock_outbox set status='skipped',lease_until=null where event_id=$1 and lease_token=$2", [row.event_id, token]);
      continue;
    }
    const body = JSON.stringify(typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload);
    const timestamp = String(Math.floor(now / 1000));
    let ok = false;
    try {
      const response = await (options.fetcher ?? fetch)(config.url!, {
        method: "POST", body, redirect: "error", signal: AbortSignal.timeout(8000),
        headers: { "Content-Type": "application/json", "X-Rarebird-Event-ID": row.event_id,
          "X-Rarebird-Timestamp": timestamp, "X-Rarebird-Signature": stockWebhookSignature(config.secret!, timestamp, body) },
      });
      ok = response.ok;
      await response.body?.cancel();
    } catch { /* No payloads, endpoint secrets or provider credentials in logs. */ }
    const attempts = row.attempts + 1, status = ok ? "delivered" : attempts >= 5 ? "failed" : "pending";
    await sql.unsafe("update public.rarebird_stock_outbox set status=$3,attempts=$4,next_attempt_at=to_timestamp($5),delivered_at=$6,lease_until=null where event_id=$1 and lease_token=$2", [row.event_id, token, status, attempts, (clock() + Math.min(120000, 15000 * 2 ** attempts)) / 1000, ok ? new Date(clock()).toISOString() : null]);
    if (ok) delivered++; else failed++;
  }
  return { delivered, failed };
}
