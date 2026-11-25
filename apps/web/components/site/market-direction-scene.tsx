"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ArrowRight, RotateCcw } from "lucide-react";
import { sceneXY } from "./scene-projection";
import "./market-direction-scene.css";

export type MarketDirection = "rising" | "falling" | "sideways";
type Point = { x: number; y: number };
type MarketScenario = {
  price: readonly number[];
  volume: readonly number[];
  ticks: readonly number[];
  reference: { label: string; lower: number; upper?: number };
  checkpoint: { index: number; label: string; detail: string };
};

const scenarios: Record<MarketDirection, MarketScenario> = {
  rising: {
    price: [100, 100.6, 100.2, 101.1, 100.8, 102.3, 101.9, 103.2, 104.8, 104.1, 105.2, 107.9, 107.1, 109.4, 108.8, 110.6, 112.1, 110.4, 112.7, 114.3, 113.9, 116.1, 115.4, 117.3],
    volume: [22, 30, 19, 29, 25, 38, 24, 42, 39, 25, 42, 87, 56, 69, 41, 49, 61, 43, 59, 66, 45, 73, 47, 57],
    ticks: [96, 102, 108, 114, 120],
    reference: { label: "Earlier high", lower: 105.2 },
    checkpoint: { index: 11, label: "Strength develops", detail: "Illustrative price strength. A stock setup also needs relative strength, unusual volume and a reasonable spread." },
  },
  falling: {
    price: [100, 100.9, 100.6, 101.3, 100.2, 99.7, 100.5, 98.8, 99.2, 98.1, 98.4, 95.4, 96.7, 94.8, 93.9, 94.5, 92.3, 91.4, 92.8, 90.2, 89.8, 90.6, 88.1, 87.6],
    volume: [21, 29, 18, 32, 24, 38, 25, 44, 30, 52, 36, 94, 65, 76, 48, 34, 66, 59, 38, 69, 46, 42, 78, 63],
    ticks: [84, 89, 94, 99, 104],
    reference: { label: "Prior support", lower: 98.1 },
    checkpoint: { index: 11, label: "Momentum fades", detail: "Illustrative fading momentum. The screener invalidates a setup when its measured conditions no longer qualify." },
  },
  sideways: {
    price: [100, 101.1, 102.1, 101.3, 99.6, 98.7, 97.4, 98, 99.9, 100.2, 101.8, 102.9, 101.5, 99.9, 98.2, 97.2, 98.7, 99.5, 100.8, 102.1, 102.5, 101.4, 100.2, 100.7],
    volume: [24, 28, 36, 27, 29, 31, 51, 28, 33, 18, 26, 42, 31, 23, 35, 53, 39, 27, 25, 32, 37, 24, 19, 27],
    ticks: [96, 98, 100, 102, 104],
    reference: { label: "Trading range", lower: 97, upper: 103 },
    checkpoint: { index: 15, label: "No clear move", detail: "An illustrative price range. A current scan can return no qualifying setup; missing measurements are shown separately." },
  },
};

const width = 480;
const height = 256;
const left = 39;
const right = 464;
const top = 14;
const priceBottom = 184;
const volumeBottom = 248;

function smoothCurve(points: readonly Point[]) {
  const segments = points.slice(0, -1).map((point, index) => {
    const before = points[index - 1] ?? point;
    const next = points[index + 1];
    const after = points[index + 2] ?? next;
    const first = { x: point.x + (next.x - before.x) / 6, y: point.y + (next.y - before.y) / 6 };
    const second = { x: next.x - (after.x - point.x) / 6, y: next.y - (after.y - point.y) / 6 };
    return `C${sceneXY(first)} ${sceneXY(second)} ${sceneXY(next)}`;
  });
  return `M${sceneXY(points[0])} ${segments.join(" ")}`;
}

export default function MarketDirectionScene({ active, id }: { active: MarketDirection; id: string }) {
  const { price, volume, ticks, reference, checkpoint } = scenarios[active];
  const last = price.length - 1;
  const [session, setSession] = useState(last);
  const [replay, setReplay] = useState(0);
  const figure = useRef<HTMLElement>(null);
  const minimum = ticks[0];
  const scale = (priceBottom - top) / (ticks[ticks.length - 1] - minimum);
  const y = (value: number) => priceBottom - (value - minimum) * scale;
  const step = (right - left) / last;
  const points = price.map((value, index) => ({ x: left + index * step, y: y(value) }));
  const curve = smoothCurve(points);
  const current = points[session];
  const marker = points[checkpoint.index];
  const value = price[session];
  const change = (value / price[0] - 1) * 100;
  const changeLabel = (change > 0 ? "+" : change < 0 ? "−" : "") + Math.abs(change).toFixed(1) + "%";
  const gradient = id + "-price-fill";

  useEffect(() => {
    const target = figure.current;
    if (!target || typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      setReplay(value => value || 1);
    }, { threshold: 0.18 });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  function inspectPointer(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * width / bounds.width;
    setSession(Math.min(last, Math.max(0, Math.round((x - left) / step))));
  }

  return <figure className="rb-market-figure" ref={figure} aria-label={`Illustrative ${active} market chart`}>
    <div className="rb-market-figure-head">
      <div>
        <p className="rb-market-figure-label">Illustrative price index</p>
        <div className="rb-market-readout"><strong>{value.toFixed(1)}</strong><span>{changeLabel} from start</span></div>
      </div>
      <button type="button" className="rb-market-replay" aria-label="Replay chart" onClick={() => {
        setSession(last);
        setReplay(value => value + 1);
      }}><RotateCcw size={15} aria-hidden="true" /> Replay</button>
    </div>

    <svg className="rb-market-chart" viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false"
      onPointerMove={event => { if (event.pointerType === "mouse") inspectPointer(event); }} onPointerDown={inspectPointer}>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop className="rb-market-fill-top" />
          <stop className="rb-market-fill-bottom" offset="1" />
        </linearGradient>
      </defs>
      <g className="rb-market-grid">
        {ticks.map(tick => <g key={tick}>
          <line x1={left} x2={right} y1={y(tick)} y2={y(tick)} />
          <text x={left - 7} y={y(tick)} textAnchor="end" dominantBaseline="middle">{tick}</text>
        </g>)}
        {[left, left + step * 6, left + step * 12, left + step * 18, right].map(x => <line key={x} x1={x} x2={x} y1={top} y2={priceBottom} />)}
        <line x1={left} x2={right} y1={volumeBottom} y2={volumeBottom} />
      </g>
      {reference.upper !== undefined && <rect className="rb-market-range" x={left} y={y(reference.upper)} width={right - left} height={y(reference.lower) - y(reference.upper)} />}
      <line className="rb-market-reference" x1={left} x2={right} y1={y(reference.lower)} y2={y(reference.lower)} />
      {reference.upper !== undefined && <line className="rb-market-reference" x1={left} x2={right} y1={y(reference.upper)} y2={y(reference.upper)} />}

      <g key={replay} data-animate={replay > 0}>
        <path className="rb-market-area" d={`${curve} L${right},${priceBottom} L${left},${priceBottom} Z`} fill={`url(#${gradient})`} />
        <g className="rb-market-volume">
          {volume.map((amount, index) => {
            const bar = amount * 0.48;
            return <rect key={index} x={points[index].x - 5} y={volumeBottom - bar} width="10" height={bar} rx="2"
              data-current={index === session} style={{ "--bar-delay": `${index * 28}ms` } as CSSProperties} />;
          })}
        </g>
        <path className="rb-market-price-line" d={curve} pathLength="1" />
        <g className="rb-market-checkpoint">
          <line x1={marker.x} x2={marker.x} y1={marker.y + 6} y2={priceBottom} />
          <circle cx={marker.x} cy={marker.y} r="6" />
        </g>
        <g className="rb-market-cursor">
          <line x1={current.x} x2={current.x} y1={top} y2={volumeBottom} />
          <circle cx={current.x} cy={current.y} r="5" />
        </g>
      </g>
    </svg>

    <div className="rb-market-legend">
      <span><i className="rb-market-legend-volume" aria-hidden="true" /> Relative volume</span>
      <span><i className="rb-market-legend-reference" aria-hidden="true" /> {reference.label}</span>
    </div>
    <label className="rb-market-scrubber">
      <span>Session {session + 1} of {price.length}</span>
      <input type="range" min={0} max={last} value={session} onChange={event => setSession(Number(event.target.value))}
        aria-label="Inspect an illustrative trading session" aria-valuetext={`Session ${session + 1} of ${price.length}, index ${value.toFixed(1)}, ${changeLabel} from start`} />
    </label>
    <figcaption className="rb-market-annotation">
      <button type="button" onClick={() => setSession(checkpoint.index)} aria-label={`Inspect ${checkpoint.label.toLowerCase()} at session ${checkpoint.index + 1}`}>
        <i aria-hidden="true" /> {checkpoint.label} <ArrowRight size={14} aria-hidden="true" />
      </button>
      <span>{checkpoint.detail}</span>
    </figcaption>
  </figure>;
}
