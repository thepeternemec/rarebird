"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ArrowRight, Check, Copy, Radio, RefreshCw } from "lucide-react";
import { STOCK_SCREENER_UNIVERSE, type StockAlert, type StockScreenerFeed } from "@rarebird/contracts";
import { RAREBIRD_MCP_URL } from "./connection-details";
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
function AlertCard({ alert }: { alert: StockAlert }) {
  return <article className="rb-screen-alert">
    <div className="rb-screen-alert-title"><div><span className="rb-screen-symbol">{alert.symbol}</span><span>{alert.label}</span></div><span className={`rb-screen-tag is-${alert.state}`}>{stateLabel[alert.state]}</span></div>
    <p>{alert.reason}</p>
    <dl className="rb-screen-metrics">
      <div><dt>5m relative move</dt><dd>{percent(alert.latest.relative_return_bps)}</dd></div>
      <div><dt>Relative volume</dt><dd>{alert.latest.relative_volume.toFixed(1)}×</dd></div>
      <div><dt>Observed spread</dt><dd>{alert.latest.spread_bps.toFixed(1)} bp</dd></div>
      <div><dt>Reference price</dt><dd>{price(alert.reference.price)}</dd></div>
    </dl>
    {alert.evidence.length > 0 && <div className="rb-screen-context"><span>Recent reporting · context, cause unconfirmed</span>{alert.evidence.map(e => <a key={e.url} href={e.url} target="_blank" rel="noopener noreferrer">{e.title}<ArrowUpRight size={14} /><small>{e.source} · {time(e.published_at)}</small></a>)}</div>}
    <footer><span>Detected {time(alert.created_at)}</span><span>{alert.closed_at ? `Closed ${time(alert.closed_at)}` : alert.state === "active" ? `Valid until ${time(alert.valid_until)}` : `Lifetime ends ${time(alert.expires_at)}`}</span><Link href={`/app?beat=${alert.beat_id}`}>Investigate <ArrowRight size={14} /></Link></footer>
  </article>;
}

export default function StockScreener() {
  const [feed, setFeed] = useState<StockScreenerFeed | null>(null), [error, setError] = useState(false);
  const [loading, setLoading] = useState(true), [now, setNow] = useState(0), [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"setups" | "history" | "outcomes">("setups");
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
    const poll = setInterval(() => { setNow(Date.now()); if (!document.hidden) void refresh(controller.signal); }, 15000);
    const visible = () => { setNow(Date.now()); if (!document.hidden) void refresh(controller.signal); };
    document.addEventListener("visibilitychange", visible);
    return () => { controller.abort(); clearInterval(poll); document.removeEventListener("visibilitychange", visible); };
  }, [refresh]);
  const stale = Boolean(feed?.source.last_scan_at && now - Date.parse(feed.source.last_scan_at) > 90000);
  const monitoring = !error && !stale && feed?.status === "monitoring";
  const status = loading ? "Checking coverage" : error ? "Connection unavailable" : stale ? "Data hold" : ({ not_configured: "Awaiting stock feed", warming_up: "Building baseline", market_closed: "Market closed", monitoring: "Monitoring", data_hold: "Data hold", unavailable: "Screening unavailable" }[feed?.status ?? "unavailable"]);
  const active = (feed?.active ?? []).map(a => currentAlert(a, now)).filter(a => a.state !== "expired").map(a => monitoring || a.state !== "active" ? a : { ...a, state: "data_hold" as const, reason: "Screening is on hold. Waiting for a fresh measurement." });
  const recent = (feed?.recent ?? []).map(a => currentAlert(a, now));
  const universe = feed?.universe ?? STOCK_SCREENER_UNIVERSE;
  async function copyConnection() {
    try { await navigator.clipboard.writeText(RAREBIRD_MCP_URL); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setCopied(false); }
  }
  return <div className="rb-stock-screen">
    <header className="rb-screen-head"><div><span className="rb-screen-eyebrow"><Radio size={13} /> US EQUITIES · EXPERIMENTAL PILOT</span><h1>Catch the setup.<br /><span>Follow what happens.</span></h1><p>Rarebird screens for developing stock strength, keeps the evidence together, and tells your agent when the setup changes.</p></div><Link className="rb-screen-connect" href="/docs/connect#stock-screener">Connect your agent <ArrowUpRight size={16} /></Link></header>

    <section className="rb-screen-status" aria-label="Screener status"><div><span className={`rb-screen-dot${monitoring ? " is-live" : ""}`} /><strong role="status">{status}</strong><span>{feed?.source.last_scan_at ? `Last scan ${time(feed.source.last_scan_at)}` : "No stock measurements yet"}</span></div><button type="button" onClick={() => { setLoading(true); void refresh(); }} aria-label="Refresh stock screener"><RefreshCw size={15} /></button></section>
    <p className="rb-screen-explanation">{error ? "Could not read the stock screener. Previously loaded setups may be out of date." : stale ? "The last scan is no longer current. Setups are on hold until fresh measurements arrive." : feed?.message ?? "Reading source coverage and the latest screening state…"}</p>

    <section className="rb-screen-universe" aria-label="Stock coverage">
      {universe.map(s => {
        const screen = feed?.coverage.find(c => c.symbol === s.symbol), measured = screen?.metrics && monitoring;
        return <div key={s.symbol}><div className="rb-screen-stock-name"><Link href={`/app?beat=${s.beat_id}`}>{s.symbol}<ArrowUpRight size={13} /></Link><span>{s.label}</span></div><div className="rb-screen-stock-reading"><strong>{measured ? percent(screen.metrics!.relative_return_bps) : "—"}</strong><span>{measured ? "5m vs. SPY, beta adjusted" : "Awaiting current measurement"}</span></div><span className="rb-screen-stock-state" title={screen?.reason}>{monitoring && screen ? stateLabel[screen.state] : status}</span></div>;
      })}
    </section>

    <div className="rb-screen-workspace">
      <section className="rb-screen-main" aria-label="Screening results">
        <div className="rb-screen-tabs" role="tablist" aria-label="Screener views">{([['setups', 'Setups'], ['history', 'History'], ['outcomes', 'Outcomes']] as const).map(([value, label]) => <button key={value} role="tab" id={`screen-tab-${value}`} aria-selected={tab === value} aria-controls={`screen-panel-${value}`} onClick={() => setTab(value)}>{label}{value === "setups" && <span>{active.filter(a => a.state === "active").length}</span>}</button>)}</div>
        <div role="tabpanel" id={`screen-panel-${tab}`} aria-labelledby={`screen-tab-${tab}`}>
          {tab === "setups" && (active.length ? active.map(a => <AlertCard key={a.id} alert={a} />) : <div className="rb-screen-empty"><div className="rb-screen-empty-plot" aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /><span /></div><h2>{monitoring ? "No qualifying setup right now." : feed?.status === "market_closed" && !stale ? "Back when the market opens." : "Ready for the first stock setup."}</h2><p>{monitoring ? "The scanner is checking strength, volume and spread together. A price move alone does not trigger an alert." : "Setups appear here once the stock feed is connected, the market is open and the intraday baseline is complete."}</p><span>NVDA · AAPL · MSFT · GOOGL / benchmark SPY</span></div>)}
          {tab === "history" && <div className="rb-screen-history">{recent.length ? recent.map(a => <AlertCard key={a.id} alert={a} />) : <div className="rb-screen-empty"><h2>Every setup gets a history.</h2><p>Detection, data holds, invalidation and expiry will be recorded with a stable alert ID. No stock alerts have been recorded yet.</p></div>}<p className="rb-screen-small">Latest {recent.length} setups · retained for 30 days. Agents can replay lifecycle events with a saved cursor.</p></div>}
          {tab === "outcomes" && <div className="rb-screen-outcomes"><h2>Measure the follow-through.</h2><p>We freeze the reference when a setup first appears, then observe the stock and benchmark 15 and 60 minutes later.</p><div className="rb-screen-score"><div><strong>{feed?.evaluation.observed ?? 0}</strong><span>15m observations</span></div><div><strong>{feed?.evaluation.pending ?? 0}</strong><span>Pending</span></div><div><strong>{feed?.evaluation.missing ?? 0}</strong><span>Missing</span></div></div>{feed?.evaluation.mean_cost_scenario_bps != null && <p>Mean 15m relative move after the cost scenario: {percent(feed.evaluation.mean_cost_scenario_bps)}.</p>}<p className="rb-screen-small">These are forward observations, not executed trades. The cost scenario subtracts 20 bp plus the observed entry spread. No performance conclusion is shown before 20 observations.</p>{recent.length > 0 && <div className="rb-screen-table-wrap"><table><thead><tr><th>Stock / detected</th><th>15m relative</th><th>60m relative</th></tr></thead><tbody>{recent.map(a => <tr key={a.id}><td>{a.symbol}<small>{time(a.created_at)}</small></td>{a.outcomes.map(o => <td key={o.minutes}>{o.status === "observed" && o.relative_return_bps !== null ? percent(o.relative_return_bps) : o.status === "pending" ? "Pending" : "Missing"}</td>)}</tr>)}</tbody></table></div>}</div>}
        </div>
      </section>

      <aside className="rb-screen-aside"><section><span className="rb-screen-eyebrow">THE FIRST SCREEN</span><h2>Strength with participation.</h2><ol><li><span>01</span><div><strong>Something is changing</strong><p>Five-minute strength versus SPY, adjusted for the stock’s recent market sensitivity.</p></div></li><li><span>02</span><div><strong>The move has participation</strong><p>Unusual traded volume and a reasonable observed spread. Already extended moves are held back.</p></div></li><li><span>03</span><div><strong>Your agent gets the change</strong><p>A stable setup ID, linked context and a clear update when the setup fades or expires.</p></div></li></ol></section>
        <section><span className="rb-screen-eyebrow">SOURCE & DELIVERY</span><dl className="rb-screen-source"><div><dt>Instrument</dt><dd>US shares</dd></div><div><dt>Benchmark</dt><dd>SPY</dd></div><div><dt>Price source</dt><dd>{feed?.status === "not_configured" || !feed ? "Not connected" : `Alpaca · ${feed.source.feed.toUpperCase()}`}</dd></div><div><dt>Screen cadence</dt><dd>{feed?.source.mode === "streaming" ? "Stream · closed 1m bars" : "Scheduled · 1 minute"}</dd></div><div><dt>Agent delivery</dt><dd>{feed?.delivery.configured ? "Webhook configured" : "Webhook not configured"}</dd></div></dl><p className="rb-screen-small">{feed?.source.coverage ?? "Source coverage is shown after the first read."}</p></section>
        <section className="rb-screen-agent"><h2>One connection for your agent.</h2><p>Read setups through MCP, follow changes with a cursor, or receive signed events at a configured webhook.</p><code>{RAREBIRD_MCP_URL}</code><button onClick={() => void copyConnection()}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied MCP URL" : "Copy MCP connection URL"}</button><Link href="/docs/connect#stock-screener">Setup &amp; event guide <ArrowRight size={14} /></Link></section>
      </aside>
    </div>
    <footer className="rb-screen-footnote"><ArrowDownRight size={16} /><p>This is the first stock screen, not a return forecast. Market coverage, current measurements and alert expiry are always part of the result.</p></footer>
  </div>;
}
