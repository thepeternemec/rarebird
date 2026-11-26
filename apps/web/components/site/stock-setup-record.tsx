"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Clock3, X } from "lucide-react";
import type { StockAlert, StockEventDelivery, StockScreenEvent, StockScreenerFeed } from "@rarebird/contracts";
import CopyButton from "./copy-button";

const percent = (bps: number) => `${bps >= 0 ? "+" : ""}${(bps / 100).toFixed(2)}%`;
const time = (value: string) => new Date(value).toLocaleString(undefined, {
  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short",
});
const eventLabel = { created: "Setup detected", updated: "Setup updated", data_hold: "Data hold", invalidated: "Setup invalidated", expired: "Setup expired", measured: "Outcome recorded" };
const deliveryLabel = { delivered: "Endpoint acknowledged", pending: "Delivery pending", failed: "Delivery failed", skipped: "Delivery skipped", not_queued: "Delivery not queued" };

export default function StockSetupRecord({ alert, revision, onClose }: { alert: StockAlert; revision: string; onClose: () => void }) {
  const [events, setEvents] = useState<StockScreenEvent[]>([]);
  const [receipts, setReceipts] = useState<Record<string, StockEventDelivery>>({});
  const [cursor, setCursor] = useState("0"), [more, setMore] = useState(false);
  const [error, setError] = useState(false), [loading, setLoading] = useState(true);
  async function read(after: string, signal: AbortSignal) {
    try {
      const params = new URLSearchParams({ alert_id: alert.id, after, limit: "50" });
      const response = await fetch("/api/v2/stock-screener?" + params, { cache: "no-store", signal });
      if (!response.ok) throw new Error("unavailable");
      const data = await response.json() as StockScreenerFeed;
      if (data.status === "unavailable") throw new Error("unavailable");
      setEvents(previous => {
        const byId = new Map(previous.map(event => [event.id, event]));
        data.events.forEach(event => byId.set(event.id, event));
        return Array.from(byId.values()).sort((a, b) => BigInt(a.sequence) < BigInt(b.sequence) ? -1 : 1);
      });
      setReceipts(previous => ({ ...previous, ...Object.fromEntries((data.event_delivery ?? []).map(receipt => [receipt.event_id, receipt])) }));
      setCursor(data.next_cursor); setMore(data.has_more); setError(false);
    } catch { if (!signal.aborted) setError(true); }
    finally { if (!signal.aborted) setLoading(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    void read("0", controller.signal);
    return () => controller.abort();
    // Each published snapshot refreshes receipt status as well as the event journal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert.id, revision]);

  const delivered = events.some(event => event.type === "created" && receipts[event.id]?.status === "delivered");
  const updated = events.some(event => event.type === "updated");
  const closed = events.some(event => event.type === "expired" || event.type === "invalidated");
  const measured = alert.outcomes.every(outcome => outcome.status === "observed");
  const steps = [["Detected", true], ["Delivered", delivered], ["Updated", updated], ["Closed", closed], ["Measured", measured]] as const;

  return <section className="rb-setup-record" aria-labelledby="setup-record-title">
    <header><div><span className="rb-screen-eyebrow">Setup record</span><h2 id="setup-record-title" tabIndex={-1}>{alert.symbol} <span>· {alert.state.replace("_", " ")}</span></h2></div>
      <button type="button" onClick={onClose} aria-label="Close setup record"><X size={18} /></button></header>
    <div className="rb-setup-id"><code>{alert.id}</code><CopyButton text={alert.id} label="Copy setup ID" /></div>
    <ol className="rb-setup-progress" aria-label="Recorded lifecycle milestones">{steps.map(([label, done]) => <li key={label} data-done={done}>
      {done ? <Check size={14} aria-hidden="true" /> : <Clock3 size={14} aria-hidden="true" />}<span>{label}</span>
    </li>)}</ol>
    <p className="rb-screen-small">Milestones reflect the retained journal and recorded delivery acknowledgements. A skipped step remains visible. Delivery confirms the endpoint returned success.</p>
    <dl className="rb-setup-deadlines">
      <div><dt>Detected</dt><dd>{time(alert.created_at)}</dd></div>
      <div><dt>Latest measurement valid until</dt><dd>{time(alert.valid_until)}</dd></div>
      <div><dt>Maximum lifetime ends</dt><dd>{time(alert.expires_at)}</dd></div>
    </dl>
    <div className="rb-screen-table-wrap"><table><caption>Measurements at detection and the latest check</caption><thead><tr><th>Check</th><th>Frozen reference</th><th>Latest measurement</th></tr></thead><tbody>
      <tr><th>Relative move</th><td>{percent(alert.reference.relative_return_bps)}</td><td>{percent(alert.latest.relative_return_bps)}</td></tr>
      <tr><th>Volume vs baseline</th><td>{alert.reference.relative_volume.toFixed(2)}×</td><td>{alert.latest.relative_volume.toFixed(2)}×</td></tr>
      <tr><th>Bid–ask spread</th><td>{alert.reference.spread_bps.toFixed(2)} bp</td><td>{alert.latest.spread_bps.toFixed(2)} bp</td></tr>
      <tr><th>Measured at</th><td>{time(alert.reference.measured_at)}</td><td>{time(alert.latest.measured_at)}</td></tr>
    </tbody></table></div>
    <h3>Reporting known at detection</h3>
    {alert.evidence.length ? <ul className="rb-setup-sources">{alert.evidence.map(evidence => <li key={evidence.url}><a href={evidence.url} target="_blank" rel="noopener noreferrer">{evidence.title} <ArrowUpRight size={14} /></a>
      <small>{evidence.source} · Published {time(evidence.published_at)} · Available to Rarebird {time(evidence.known_at)}</small></li>)}</ul>
      : <p className="rb-screen-small">No source-linked reporting was attached at detection. The screening measurements above explain the trigger.</p>}
    <h3>Lifecycle and delivery</h3>
    {loading && <p role="status">Loading the setup journal…</p>}
    {error && <p role="status">The journal could not be refreshed. The entries below may be out of date.</p>}
    <ol className="rb-setup-events">{events.map(event => {
      const receipt = receipts[event.id];
      return <li key={event.id}><span className="rb-setup-event-mark" /><div><strong>{eventLabel[event.type]}</strong>
        <time dateTime={event.recorded_at}>{time(event.recorded_at)} · Version {event.alert.version}</time>
        <p>{event.alert.reason}</p><small>{receipt ? deliveryLabel[receipt.status] : "Delivery status unavailable"}{receipt?.delivered_at ? " · " + time(receipt.delivered_at) : ""}{receipt?.attempts ? ` · ${receipt.attempts} attempt(s)` : ""}</small>
        <code>{event.id}</code></div></li>;
    })}</ol>
    {!loading && !events.length && !error && <p className="rb-screen-small">No retained lifecycle events were returned for this setup.</p>}
    {more && <button type="button" className="rb-screen-record-button" onClick={() => void read(cursor, new AbortController().signal)}>Load more events</button>}
    <div className="rb-screen-table-wrap"><table><caption>Forward observations from the frozen reference</caption><thead><tr><th>Horizon</th><th>Observed at</th><th>Stock move</th><th>Relative move</th><th>After cost scenario</th></tr></thead>
      <tbody>{alert.outcomes.map(outcome => <tr key={outcome.minutes}><th>{outcome.minutes} min</th><td>{outcome.measured_at ? time(outcome.measured_at) : outcome.status === "pending" ? "Due " + time(outcome.due_at) : "Missing"}</td>
        {[outcome.asset_return_bps, outcome.relative_return_bps, outcome.cost_scenario_bps].map((value, index) => <td key={index}>{outcome.status === "observed" && value !== null ? percent(value) : "—"}</td>)}</tr>)}</tbody></table></div>
    <p className="rb-screen-small">Recorded price observations. The cost scenario subtracts 20 bp plus the frozen entry spread. Missing outcomes remain missing. Both favourable and unfavourable setups stay in the record.</p>
  </section>;
}
