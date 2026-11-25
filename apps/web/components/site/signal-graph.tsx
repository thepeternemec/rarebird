"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, ArrowUpRight, Check, Circle, Pause, Play, Radio } from "lucide-react";
import { ACTIVITY_CHECKS, ACTIVITY_COLUMNS, ACTIVITY_STEPS, ACTIVITY_STOCKS, activityLevel } from "./stock-activity-demo";
import "./signal-graph.css";

const STEP_DURATION = 6500;

/** A contribution-style illustration of screening, not a live market or performance chart. */
export default function StockScreeningActivity() {
  const [step, setStep] = useState(0), [stock, setStock] = useState(0), [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(true), [visible, setVisible] = useState(true), [inView, setInView] = useState(false);
  const root = useRef<HTMLDivElement>(null), tabs = useRef<Array<HTMLButtonElement | null>>([]), uid = useId();
  const playing = !paused && !reduced && visible && inView;
  const stage = ACTIVITY_STEPS[step], asset = ACTIVITY_STOCKS[stock];

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => setReduced(preference.matches), visibility = () => setVisible(!document.hidden);
    motion(); visibility(); preference.addEventListener("change", motion); document.addEventListener("visibilitychange", visibility);
    const observer = new IntersectionObserver(entries => setInView(entries[0]?.isIntersecting ?? false), { threshold: .2 });
    if (root.current) observer.observe(root.current);
    return () => { preference.removeEventListener("change", motion); document.removeEventListener("visibilitychange", visibility); observer.disconnect(); };
  }, []);
  useEffect(() => {
    if (!playing) return;
    const interval = window.setInterval(() => setStep(value => (value + 1) % ACTIVITY_STEPS.length), STEP_DURATION);
    return () => clearInterval(interval);
  }, [playing]);
  const choose = (index: number) => { setPaused(true); setStep(index); };

  return <div className="rb-activity" ref={root} onFocusCapture={event => { if ((event.target as HTMLElement).closest(".rb-activity-steps, .rb-activity-stock-select")) setPaused(true); }} data-playing={playing} data-step={step} style={{ "--activity-duration": `${STEP_DURATION}ms` } as CSSProperties}>
    <div className="rb-activity-toolbar"><div><Radio size={15} aria-hidden="true" /><span>rarebird <i>/</i> stock watch</span></div><div><span className="rb-activity-example">Illustrative example</span><button type="button" aria-label={reduced ? "Animation disabled by reduced-motion preference" : paused ? "Resume animation" : "Pause animation"} disabled={reduced} onClick={() => setPaused(value => !value)}>{paused || reduced ? <Play size={14} /> : <Pause size={14} />}</button></div></div>

    <div className="rb-activity-steps" role="tablist" aria-label="How stock screening works">{ACTIVITY_STEPS.map((item, index) => <button type="button" role="tab" key={item.name}
      ref={node => { tabs.current[index] = node; }} id={`${uid}-step-${index}`} aria-controls={`${uid}-panel`} aria-selected={step === index} tabIndex={step === index ? 0 : -1}
      onClick={() => choose(index)} onKeyDown={event => {
        const next = event.key === "ArrowRight" ? (index + 1) % 4 : event.key === "ArrowLeft" ? (index + 3) % 4 : event.key === "Home" ? 0 : event.key === "End" ? 3 : null;
        if (next === null) return; event.preventDefault(); choose(next); tabs.current[next]?.focus();
      }}><span>0{index + 1}</span>{item.name}<i className="rb-activity-step-progress" key={`${step}-${index}`} /></button>)}</div>

    <div className="rb-activity-body">
      <div className="rb-activity-visual">
        <div className="rb-activity-visual-heading"><div><span className="rb-activity-micro">SCREENING CHECKS</span><h3>Small checks. A clearer picture.</h3></div><span className="rb-activity-symbol">{asset.symbol}</span></div>
        <div className="rb-activity-stock-select" role="group" aria-label="Choose an illustrative stock">{ACTIVITY_STOCKS.map((item, index) => <button type="button" key={item.symbol} aria-pressed={stock === index} onClick={() => { setPaused(true); setStock(index); }}>{item.symbol}</button>)}</div>

        <div className="rb-activity-matrix" aria-hidden="true">
          <div className="rb-activity-axis"><span>Earlier checks</span><span>Later checks <ArrowRight size={11} /></span></div>
          {ACTIVITY_STOCKS.map((item, assetIndex) => <div className="rb-activity-stock" key={item.symbol} data-selected={assetIndex === stock}>
            <div className="rb-activity-stock-label"><strong>{item.symbol}</strong><span>{item.name}</span></div>
            <div className="rb-activity-stock-checks">{ACTIVITY_CHECKS.map((check, checkIndex) => <div className="rb-activity-check-row" key={check}>
              <span className="rb-activity-check-label">{check}</span>
              <div className="rb-activity-cells">{Array.from({ length: ACTIVITY_COLUMNS }, (_, column) => <span key={column} className="rb-activity-cell"
                data-level={activityLevel(assetIndex, checkIndex, column, stock)} data-older={column < 10}
                data-future={column > stage.column} data-current={column === stage.column && assetIndex === stock}
                data-match={assetIndex === stock && column >= 24 && column <= 26 && step > 0} />)}</div>
            </div>)}</div>
          </div>)}
          <div className="rb-activity-grid-key"><span>Each column is an example screening minute.</span><span>Less activity <i data-level="0" /><i data-level="1" /><i data-level="2" /><i data-level="3" /> More</span></div>
        </div>
        <div className="rb-activity-scan-caption"><span className="rb-activity-indicator" /><span>{step === 0 ? "Scanning for changes across four stocks" : step === 1 ? `${asset.symbol}: strength, volume and spread align` : step === 2 ? `${asset.symbol}: a setup event is ready for the agent` : `${asset.symbol}: the conditions fade; the setup is invalidated`}</span></div>
      </div>

      <div className="rb-activity-explanation" role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-step-${step}`} tabIndex={0}>
        <div className="rb-activity-panel-copy" key={step}><span className="rb-activity-micro">0{step + 1} / {stage.name}</span><h3>{stage.title}</h3><p>{stage.description}</p></div>
        <div className="rb-activity-event" data-phase={step}><div><span>{asset.symbol}</span><span>{stage.status}</span></div>
          {step < 2 ? <ul>{["Strength versus SPY", "Unusual traded volume", "Spread within limit"].map(label => <li key={label}>{step === 1 ? <Check size={13} /> : <Circle size={11} />}<span>{label}</span><small>{step === 1 ? "Pass" : "Checking"}</small></li>)}</ul>
            : step === 2 ? <><p>Developing strength with participation.</p><dl><div><dt>Setup ID</dt><dd>demo_{asset.symbol.toLowerCase()}_01</dd></div><div><dt>Delivered with</dt><dd>Reason, context, expiry</dd></div></dl><span className="rb-activity-event-route"><Radio size={12} /> Rarebird <ArrowRight size={12} /> Your agent</span></>
              : <><p>The same setup. An updated state.</p><div className="rb-activity-state-change"><span>Active</span><ArrowRight size={13} /><strong>Invalidated</strong></div><dl><div><dt>Setup ID</dt><dd>demo_{asset.symbol.toLowerCase()}_01</dd></div><div><dt>Outcome checks</dt><dd>15m / 60m</dd></div></dl></>}
        </div>
        <p className="rb-activity-panel-note">{stage.note}</p>
      </div>
    </div>

    <div className="rb-activity-footer"><p><span>Illustration only.</span> This grid explains the workflow; it is not live data or a performance record.</p><a href="/app/screener">Open stock screener <ArrowUpRight size={14} aria-hidden="true" /></a></div>
  </div>;
}
