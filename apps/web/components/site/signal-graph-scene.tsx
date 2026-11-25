import type { CSSProperties } from "react";
import { Activity, ChartNoAxesColumnIncreasing, Check, Eye, Files } from "lucide-react";
import BrandMark from "./brand-mark";

export type SignalNode = "anomaly" | "evidence" | "timing" | "review" | "watch" | "outcomes";
export type SignalStage = Exclude<SignalNode, "review" | "watch"> | "decision";

const nodes = [
  { id: "anomaly", label: "Developing move", caption: "Stock versus SPY", icon: Activity, x: 12, y: 23, mx: 23, my: 9 },
  { id: "evidence", label: "Source context", caption: "Optional reporting", icon: Files, x: 12, y: 67, mx: 77, my: 9 },
  { id: "timing", label: "Setup check", caption: "Strength, volume, spread", icon: null, x: 40, y: 43, mx: 50, my: 35 },
  { id: "review", label: "Alert your agent", caption: "Delivery when configured", icon: Check, x: 66, y: 23, mx: 23, my: 60 },
  { id: "watch", label: "Keep watching", caption: "No qualifying setup", icon: Eye, x: 66, y: 67, mx: 77, my: 60 },
  { id: "outcomes", label: "Outcomes", caption: "15 / 60 min", icon: ChartNoAxesColumnIncreasing, x: 89, y: 43, mx: 50, my: 86 },
] as const;

// Wires use the same node centers as the buttons. The portrait routes leave
// sideways so no wire passes underneath the two-line labels.
const wires: { from: SignalNode; to: SignalNode; wide: string; narrow: string }[] = [
  { from: "anomaly", to: "timing", wide: "M120 92 H215 Q227 92 236 101 L298 163 Q307 172 320 172 H400", narrow: "M83 45 H112 Q124 45 130 57 L168 135 Q180 158 180 175" },
  { from: "evidence", to: "timing", wide: "M120 268 H205 Q218 268 228 258 L305 181 Q314 172 326 172 H400", narrow: "M277 45 H248 Q236 45 230 57 L192 135 Q180 158 180 175" },
  { from: "timing", to: "review", wide: "M400 172 H472 Q485 172 494 163 L556 101 Q565 92 579 92 H660", narrow: "M180 175 H164 Q149 175 143 188 L97 285 Q90 300 83 300" },
  { from: "timing", to: "watch", wide: "M400 172 H472 Q485 172 494 181 L572 259 Q581 268 594 268 H660", narrow: "M180 175 H196 Q211 175 217 188 L263 285 Q270 300 277 300" },
  { from: "review", to: "outcomes", wide: "M660 92 H723 Q736 92 745 101 L807 163 Q816 172 830 172 H890", narrow: "M83 300 H115 Q127 300 133 313 L170 397 Q180 417 180 430" },
  { from: "watch", to: "outcomes", wide: "M660 268 H706 Q719 268 728 259 L806 181 Q815 172 829 172 H890", narrow: "M277 300 H245 Q233 300 227 313 L190 397 Q180 417 180 430" },
];

function Traces({ portrait, selected }: { portrait?: boolean; selected: SignalNode | "decision" }) {
  return <svg aria-hidden="true" className={portrait ? "rb-traces portrait" : "rb-traces landscape"}
    viewBox={portrait ? "0 0 360 500" : "0 0 1000 400"} preserveAspectRatio="none">
    {wires.map(wire => {
      const d = portrait ? wire.narrow : wire.wide;
      const active = wire.from === selected || wire.to === selected;
      return <g key={wire.from + wire.to} className="rb-wire" data-active={active} data-watch={wire.from === "watch" || wire.to === "watch"}>
        <path d={d} className="rb-wire-line" />
        {active && <path d={d} className="rb-wire-pulse" pathLength="100" />}
      </g>;
    })}
  </svg>;
}

export default function SignalGraphScene({ selected, detailsId, onSelect }: {
  selected: SignalNode | "decision";
  detailsId: string;
  onSelect: (node: SignalNode) => void;
}) {
  return <div className="rb-signal-board" role="group" aria-label="Stock setup path from market measurements to agent alerts and outcomes">
    <div className="rb-map-field">
      <Traces selected={selected} />
      <Traces selected={selected} portrait />
      {nodes.map(({ id, label, caption, icon: Icon, x, y, mx, my }) => <button
        type="button" key={id} className="rb-map-node" data-hub={id === "timing"}
        aria-controls={detailsId} aria-pressed={selected === id} onClick={() => onSelect(id)}
        style={{ "--x": x + "%", "--y": y + "%", "--mx": mx + "%", "--my": my + "%" } as CSSProperties}>
        <span className="rb-map-glyph">{Icon ? <Icon size={23} strokeWidth={1.6} aria-hidden="true" /> : <BrandMark size={47} />}</span>
        <span className="rb-map-label">{label}</span>
        <span className="rb-map-caption">{caption}</span>
      </button>)}
    </div>
  </div>;
}
