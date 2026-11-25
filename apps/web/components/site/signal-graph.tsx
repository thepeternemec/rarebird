"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowUpRight, Bell, Pause, Play } from "lucide-react";
import { ACTIVITY_GRID, ACTIVITY_STEPS } from "./stock-activity-demo";
import "./signal-graph.css";

export default function StockScreeningActivity() {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [visible, setVisible] = useState(false);
  const [inView, setInView] = useState(false);
  const root = useRef<HTMLElement>(null);
  const playing = !paused && !reduced && visible && inView;
  const stage = ACTIVITY_STEPS[step];

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReduced(preference.matches);
    const updateVisibility = () => setVisible(!document.hidden);
    updateMotion();
    updateVisibility();
    preference.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateVisibility);

    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: .2 });
    if (root.current) observer.observe(root.current);
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timeout = window.setTimeout(() => setStep((step + 1) % ACTIVITY_STEPS.length), stage.duration);
    return () => window.clearTimeout(timeout);
  }, [playing, stage.duration, step]);

  return (
    <figure
      ref={root}
      className="rb-signal-field"
      aria-label="How stock screening works"
      data-playing={playing}
      style={{ "--signal-duration": `${stage.duration}ms` } as CSSProperties}
    >
      <div className="rb-signal-phases" aria-hidden="true">
        {ACTIVITY_STEPS.map(({ label }, index) => (
          <span key={label} data-current={step === index}>{label}</span>
        ))}
      </div>
      <div className="rb-signal-matrix" aria-hidden="true">
        {ACTIVITY_GRID.map((column, x) => (
          <div className="rb-signal-column" key={x} data-compact={x % 2 === 0}>
            {column.map((frames, y) => {
              const cell = frames[step];
              return (
                <span
                  key={y}
                  className="rb-signal-square"
                  data-level={cell.level}
                  data-cluster={cell.cluster}
                  data-alert={cell.isAlert}
                  style={{ "--signal-delay": `${(Math.abs(x - stage.column) + Math.abs(y - 3)) * 19}ms` } as CSSProperties}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="rb-signal-caption">
        <div className="rb-signal-message">
          <span className="rb-signal-icon" data-alert={step === 3}>
            {step === 3 ? <Bell size={16} aria-hidden="true" /> : <i />}
          </span>
          <p>{stage.message}</p>
        </div>
        <button
          type="button"
          className="rb-signal-control"
          aria-label={paused ? "Play animation" : "Pause animation"}
          onClick={() => setPaused(value => !value)}
          hidden={reduced}
        >
          {paused ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
        </button>
      </div>
      <figcaption className="rb-signal-note">
        <span>Illustrative example</span>
        <a href="/app/screener">Open stock screener <ArrowUpRight size={14} aria-hidden="true" /></a>
      </figcaption>
    </figure>
  );
}
