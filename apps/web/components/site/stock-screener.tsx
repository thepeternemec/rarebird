"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ArrowRight, Check, Copy, Radio, RefreshCw } from "lucide-react";
import { STOCK_SCREENER_UNIVERSE, type StockAlert, type StockScreenerFeed } from "@rarebird/contracts";
import { RAREBIRD_MCP_URL } from "./connection-details";
import StockSetupRecord from "./stock-setup-record";
import "./stock-screener.css";

const stateLabel: Record<string, string> = { active: "Active", candidate: "Setup detected", quiet: "No setup", extended: "Already extended", data_hold: "Data hold", warming_up: "Building baseline", expired: "Expired", invalidated: "Invalidated" };
const percent = (bps: number) => `${bps >= 0 ? "+" : ""}${(bps / 100).toFixed(2)}%`;
const price = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const time = (value: string) => new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
function currentAlert(alert: StockAlert, now: number): StockAlert {
  if (alert.closed_at) return alert;
  if (now >= Date.parse(alert.expires_at)) return { ...alert, state: "expired" };
  if (now >= Date.parse(alert.valid_until)) return { ...alert, state: "data_hold", reason: "The latest measurement has aged. Waiting for current data." };
  return alert;
}
function AlertCard({ alert, onInspect }: { alert: StockAlert; onInspect: (id: string) => void }) {
  return <article className="rb-screen-alert">
    <div className="rb-screen-alert-title"><div><span className="rb-screen-symbol">{alert.symbol}</span><span>{alert.label}</span></div><span className={`rb-screen-tag is-${alert.state}`}>{stateLabel[alert.state]}</span></div>
    <p>{alert.reason}</p>
    {alert.prediction && <p className="rb-screen-model-score">Kumo estimate {(alert.prediction.probability * 100).toFixed(1)}% · Positive 15m relative move after cost scenario. Issued {time(alert.prediction.issued_at)}. Valid until {time(alert.prediction.valid_until)}.</p>}
    <dl className="rb-screen-metrics">
      <div><dt>5m relative move</dt><dd>{percent(alert.latest.relative_return_bps)}</dd></div>
      <div><dt>Relative volume</dt><dd>{alert.latest.relative_volume.toFixed(1)}×</dd></div>
      <div><dt>Observed spread</dt><dd>{alert.latest.spread_bps.toFixed(1)} bp</dd></div>
      <div><dt>Reference price</dt><dd>{price(alert.reference.price)}</dd></div>
    </dl>
    {alert.evidence.length > 0 && <div className="rb-screen-context"><span>Recent reporting · context, cause unconfirmed</span>{alert.evidence.map(e => <a key={e.url} href={e.url} target="_blank" rel="noopener noreferrer">{e.title}<ArrowUpRight size={14} /><small>{e.source} · {time(e.published_at)}</small></a>)}</div>}
    <div className="rb-screen-alert-validity"><span>Valid until <time dateTime={alert.valid_until}>{time(alert.valid_until)}</time></span><span>Lifetime ends <time dateTime={alert.expires_at}>{time(alert.expires_at)}</time></span></div>
    <footer><button type="button" className="rb-screen-record-button" onClick={() => onInspect(alert.id)}>Open setup record <ArrowRight size={14} /></button><span>Detected {time(alert.created_at)}</span><span>{alert.closed_at ? `Closed ${time(alert.closed_at)}` : alert.state === "active" ? `Valid until ${time(alert.valid_until)}` : `Lifetime ends ${time(alert.expires_at)}`}</span><Link href={alert.beat_id ? `/app?beat=${alert.beat_id}` : `/app?q=${encodeURIComponent(alert.symbol)}`}>Investigate <ArrowRight size={14} /></Link></footer>
  </article>;
}

export default function StockScreener() {
  const [feed, setFeed] = useState<StockScreenerFeed | null>(null), [error, setError] = useState(false);
  const [loading, setLoading] = useState(true), [now, setNow] = useState(0), [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"setups" | "history" | "outcomes">("setups");
  const [coverageSearch, setCoverageSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (selectedId) document.getElementById("setup-record-title")?.focus();
  }, [selectedId]);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/v2/stock-screener", { cache: "no-store", signal });
      if (!response.ok) throw new Error("unavailable");
      setFeed(await response.json()); setError(false);
    } catch { if (!signal?.aborted) setError(true); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setNow(Date.now()); void refresh(controller.signal);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => { setNow(Date.now()); if (!document.hidden) void refresh(controller.signal); }, 15000);
    const visible = () => { setNow(Date.now()); if (!document.hidden) void refresh(controller.signal); };
    document.addEventListener("visibilitychange", visible);
    return () => { controller.abort(); clearInterval(tick); clearInterval(poll); document.removeEventListener("visibilitychange", visible); };
  }, [refresh]);
  const stale = Boolean(feed?.source.last_scan_at && now - Date.parse(feed.source.last_scan_at) > 90000);
  const monitoring = !error && !stale && feed?.status === "monitoring";
  const status = loading ? "Checking coverage" : error ? "Connection unavailable" : stale ? "Data hold" : ({ not_configured: "Awaiting stock feed", warming_up: "Building baseline", market_closed: "Market closed", monitoring: "Monitoring", data_hold: "Data hold", unavailable: "Screening unavailable" }[feed?.status ?? "unavailable"]);
  const active = (feed?.active ?? []).map(a => currentAlert(a, now)).filter(a => a.state !== "expired").map(a => monitoring || a.state !== "active" ? a : { ...a, state: "data_hold" as const, reason: "Screening is on hold. Waiting for a fresh measurement." });
  const recent = (feed?.recent ?? []).map(a => currentAlert(a, now));
  const selected = recent.find(alert => alert.id === selectedId);
  const universe = feed?.universe ?? STOCK_SCREENER_UNIVERSE;
  async function copyConnection() {
    try { await navigator.clipboard.writeText(RAREBIRD_MCP_URL); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setCopied(false); }
  }
  return <div className="rb-stock-screen">
    <header className="rb-screen-head"><div><span className="rb-screen-eyebrow"><Radio size={13} /> S&P 500 SCREENER</span><h1>Stock setups.<br /><span>A record you can follow.</span></h1><p>Review the trigger, check the evidence and expiry, then follow delivery and what happened next.</p></div><Link className="rb-screen-connect" href="/docs/connect#stock-screener">Connect your agent <ArrowUpRight size={16} /></Link></header>

    <section className="rb-screen-status" aria-label="Screener status"><div><span className={`rb-screen-dot${monitoring ? " is-live" : ""}`} /><strong role="status">{status}</strong><span>{feed?.source.last_scan_at ? `Last scan ${time(feed.source.last_scan_at)}` : "No stock measurements yet"}</span></div><button type="button" onClick={() => { setLoading(true); void refresh(); }} aria-label="Refresh stock screener"><RefreshCw size={15} /></button></section>
    <p className="rb-screen-explanation">{error ? "Could not read the stock screener. Previously loaded setups may be out of date." : stale ? "The last scan is no longer current. Setups are on hold until fresh measurements arrive." : feed?.message ?? "Reading source coverage and the latest screening state…"}</p>

    <div className="rb-screen-readiness" aria-label="Service readiness">
      <div><span className="rb-screen-eyebrow">Detection</span><strong>{loading ? "Checking the stock feed" : error ? "Feed status unavailable" : feed?.status === "not_configured" ? "Stock feed needs connecting" : status}</strong><p>Rule-based checks run on closed one-minute bars, independently of generated explanations.</p><Link href="/docs/connect#stock-screener">Feed and screening guide <ArrowUpRight size={14} /></Link></div>
      <div><span className="rb-screen-eyebrow">Agent delivery</span><strong>{loading ? "Checking delivery" : error ? "Delivery status unavailable" : feed?.delivery.configured ? "Webhook destination configured" : "Webhook needs configuring"}</strong><p>{feed?.delivery.configured ? `${feed.delivery.pending} pending · ${feed.delivery.delivered} acknowledged · ${feed.delivery.failed} failed · ${feed.delivery.skipped ?? 0} skipped.` : "MCP lets an agent read setups. Automatic delivery requires the operator to configure a signed webhook."}</p><Link href="/docs/connect#stock-screener">Agent connection and delivery <ArrowUpRight size={14} /></Link></div>
      <div><span className="rb-screen-eyebrow">Kumo prediction engine</span><strong>{feed?.model?.status === "shadow" ? "Experimental predictions recorded" : feed?.model?.status === "unavailable" ? "Model measurements unavailable" : "Collecting training observations"}</strong><p>Predicts a positive 15-minute relative move after the cost scenario, conditional on a detected setup. {feed?.model?.observed ?? 0} forward predictions measured.</p><Link href="/docs/connect#stock-screener">Prediction target and model status <ArrowUpRight size={14} /></Link></div>
    </div>
    <details className="rb-screen-coverage"><summary>Screen coverage <span>{universe.length} stocks · SPY benchmark</span></summary>
    <p className="rb-screen-small">Constituent snapshot observed {feed?.universe_snapshot?.observed_at.slice(0, 10) ?? "2026-11-26"}. Current membership is used from this snapshot onward.</p>
    <label className="rb-screen-search">Find a constituent<input type="search" value={coverageSearch} onChange={event => setCoverageSearch(event.target.value)} placeholder="Ticker or company" /></label>
    <section className="rb-screen-universe" aria-label="Stock coverage">
      {universe.filter(stock => (stock.symbol + " " + stock.label).toLowerCase().includes(coverageSearch.toLowerCase())).map(s => {
        const screen = feed?.coverage.find(c => c.symbol === s.symbol), measured = screen?.metrics && monitoring;
        return <div key={s.symbol}><div className="rb-screen-stock-name"><Link href={s.beat_id ? `/app?beat=${s.beat_id}` : `/app?q=${encodeURIComponent(s.symbol)}`}>{s.symbol}<ArrowUpRight size={13} /></Link><span>{s.label}</span></div><div className="rb-screen-stock-reading"><strong>{measured ? percent(screen.metrics!.relative_return_bps) : "—"}</strong><span>{measured ? "5m vs. SPY, beta adjusted" : "Awaiting current measurement"}</span></div><span className="rb-screen-stock-state" title={screen?.reason}>{monitoring && screen ? stateLabel[screen.state] : status}</span></div>;
      })}
    </section></details>

    <div className="rb-screen-workspace">
      <section className="rb-screen-main" aria-label="Screening results">
        <div className="rb-screen-tabs" role="tablist" aria-label="Screener views">{([['setups', 'Active setups'], ['history', 'All setups'], ['outcomes', 'Performance']] as const).map(([value, label]) => <button key={value} role="tab" id={`screen-tab-${value}`} aria-selected={tab === value} aria-controls={`screen-panel-${value}`} tabIndex={tab === value ? 0 : -1} onKeyDown={event => {
          const views = ["setups", "history", "outcomes"] as const;
          const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
          if (!offset) return;
          event.preventDefault();
          const index = (views.indexOf(value) + offset + views.length) % views.length;
          setTab(views[index]!);
          (event.currentTarget.parentElement?.querySelectorAll("button")[index] as HTMLButtonElement | undefined)?.focus();
        }} onClick={() => setTab(value)}>{label}{value === "setups" && <span>{active.filter(a => a.state === "active").length}</span>}</button>)}</div>
        <div role="tabpanel" id={`screen-panel-${tab}`} aria-labelledby={`screen-tab-${tab}`}>
          {selected && <StockSetupRecord key={selected.id} alert={selected} revision={feed?.generated_at ?? ""} onClose={() => setSelectedId(null)} />}
          {tab === "setups" && (active.length ? active.map(a => <AlertCard key={a.id} alert={a} onInspect={setSelectedId} />) : <div className="rb-screen-empty"><div className="rb-screen-empty-plot" aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /><span /></div><h2>{monitoring ? "No qualifying setup right now." : feed?.status === "market_closed" && !stale ? "Back when the market opens." : "Waiting for the first measured setup."}</h2><p>{monitoring ? "The scanner is checking strength, volume and spread together. A price move alone does not trigger an alert." : "Setups appear here once the stock feed is connected, the market is open and the intraday baseline is complete."}</p><span>S&P 500 constituent snapshot · SPY benchmark</span></div>)}
          {tab === "history" && <div className="rb-screen-history">{recent.length ? recent.map(a => <AlertCard key={a.id} alert={a} onInspect={setSelectedId} />) : <div className="rb-screen-empty"><h2>Every setup gets a history.</h2><p>Detection, data holds, invalidation and expiry will be recorded with a stable alert ID. No stock alerts have been recorded yet.</p></div>}<p className="rb-screen-small">Latest {recent.length} setups · retained for 30 days. Agents can replay lifecycle events with a saved cursor.</p></div>}
          {tab === "outcomes" && <div className="rb-screen-outcomes"><h2>The performance record.</h2><p className="rb-screen-small">Kumo forward cohort · {feed?.model?.issued ?? 0} predictions issued · {feed?.model?.observed ?? 0} observed · {feed?.model?.missing ?? 0} missing.</p>{feed?.model?.brier != null && <p>Kumo Brier score {feed.model.brier.toFixed(4)} · Base-rate Brier score {feed.model.baseline_brier?.toFixed(4)}. Lower is better on these same recorded setups.</p>}<p>Every detected setup stays in the cohort, including invalidated and expired setups. Measurements use the stock and SPY reference frozen at detection.</p><p className="rb-screen-small">{feed?.policy ?? "stock-relative-strength-v1"} · {feed?.source.feed.toUpperCase() ?? "IEX"} feed · Retained 30-day cohort · Summary horizon 15 minutes.</p><div className="rb-screen-score"><div><strong>{feed?.evaluation.observed ?? 0}</strong><span>15m observations</span></div><div><strong>{feed?.evaluation.pending ?? 0}</strong><span>Pending</span></div><div><strong>{feed?.evaluation.missing ?? 0}</strong><span>Missing</span></div></div>{feed?.evaluation.mean_cost_scenario_bps != null && <p>Mean 15m relative move after the cost scenario: {percent(feed.evaluation.mean_cost_scenario_bps)}.</p>}<p className="rb-screen-small">These are forward observations, not executed trades. The cost scenario subtracts 20 bp plus the observed entry spread. No performance conclusion is shown before 20 observations.</p>{recent.length > 0 && <div className="rb-screen-table-wrap"><table><thead><tr><th>Stock / detected</th><th>15m relative</th><th>60m relative</th><th>15m cost scenario</th><th>Record</th></tr></thead><tbody>{recent.map(a => <tr key={a.id}><td>{a.symbol}<small>{time(a.created_at)}</small></td>{a.outcomes.map(o => <td key={o.minutes}>{o.status === "observed" && o.relative_return_bps !== null ? percent(o.relative_return_bps) : o.status === "pending" ? "Pending" : "Missing"}</td>)}<td>{a.outcomes[0]?.status === "observed" && a.outcomes[0].cost_scenario_bps !== null ? percent(a.outcomes[0].cost_scenario_bps) : "—"}</td><td><button type="button" className="rb-screen-record-button" onClick={() => setSelectedId(a.id)}>Inspect</button></td></tr>)}</tbody></table></div>}<p className="rb-screen-small">Rows show the latest {recent.length} setups. Summary counts cover the entire retained policy and feed cohort. IEX and SIP observations are kept separate.</p></div>}
        </div>
      </section>

      <aside className="rb-screen-aside"><section><span className="rb-screen-eyebrow">DETECTION POLICY</span><h2>Strength with participation.</h2><ol><li><span>01</span><div><strong>Something is changing</strong><p>Five-minute strength versus SPY, adjusted for the stock’s recent market sensitivity.</p></div></li><li><span>02</span><div><strong>The move has participation</strong><p>Unusual traded volume and a reasonable observed spread. Already extended moves are held back.</p></div></li><li><span>03</span><div><strong>Your agent gets the change</strong><p>A stable setup ID and signed lifecycle events, with delivery receipts and measured outcomes.</p></div></li></ol></section>
        <section><span className="rb-screen-eyebrow">SOURCE & DELIVERY</span><dl className="rb-screen-source"><div><dt>Instrument</dt><dd>US shares</dd></div><div><dt>Benchmark</dt><dd>SPY</dd></div><div><dt>Price source</dt><dd>{feed?.status === "not_configured" || !feed ? "Not connected" : `Alpaca · ${feed.source.feed.toUpperCase()}`}</dd></div><div><dt>Screen cadence</dt><dd>{feed?.source.mode === "streaming" ? "Stream · closed 1m bars" : "Scheduled · 1 minute"}</dd></div><div><dt>Agent delivery</dt><dd>{feed?.delivery.configured ? "Webhook configured" : "Webhook not configured"}</dd></div></dl><p className="rb-screen-small">{feed?.source.coverage ?? "Source coverage is shown after the first read."}</p></section>
        <section className="rb-screen-agent"><h2>One connection for your agent.</h2><p>Read setups through MCP, follow changes with a cursor, or receive signed events at a configured webhook.</p><code>{RAREBIRD_MCP_URL}</code><button onClick={() => void copyConnection()}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied MCP URL" : "Copy MCP connection URL"}</button><Link href="/docs/connect#stock-screener">Setup &amp; event guide <ArrowRight size={14} /></Link></section>
      </aside>
    </div>
    <footer className="rb-screen-footnote"><ArrowDownRight size={16} /><p>Detection uses the published screening rules. Kumo probabilities are recorded separately for forward comparison with the base rate. Check the model time, setup state and expiry before using a score.</p></footer>
  </div>;
}
