"use client";

import { useId, useRef, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import MarketDirectionScene from "./market-direction-scene";

const PERSPECTIVES = [
  {
    id: "rising", label: "Setup developing", icon: ArrowUpRight,
    title: "A stock is starting to stand out.",
    description: "Relative strength, unusual volume and the observed spread pass together. The first screen looks for developing long-side strength in four US stocks against SPY.",
    checks: ["Does the stock stand out from SPY?", "Is participation above its baseline?", "Is the move already extended?"],
    href: "/app/screener", action: "Inspect the stock screen",
  },
  {
    id: "falling", label: "Setup fading", icon: ArrowDownRight,
    title: "An alert should come with an ending.",
    description: "When measured conditions no longer qualify, the setup is invalidated. Stale or missing data puts it on hold. Each setup also has a maximum lifetime, so an old alert cannot keep looking current.",
    checks: ["Are the latest measurements current?", "Did the qualifying conditions clear?", "Has the setup expired?"],
    href: "/docs/connect#stock-screener", action: "Understand the alert lifecycle",
  },
  {
    id: "sideways", label: "Nothing qualifies", icon: ArrowRight,
    title: "No setup is a useful answer too.",
    description: "When current measurements do not pass the rules, Rarebird returns no qualifying setup. A disconnected feed, incomplete baseline or closed market is shown separately.",
    checks: ["Is the US regular session open?", "Is today’s baseline complete?", "Is it a quiet scan or a data hold?"],
    href: "/app/screener", action: "Check coverage and readiness",
  },
] as const;

export default function MarketPerspective() {
  const [selected, setSelected] = useState(0);
  const id = useId();
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const active = PERSPECTIVES[selected];

  return <div className="rb-perspective">
    <div className="rb-perspective-tabs" role="tablist" aria-label="Explore a stock setup state">
      {PERSPECTIVES.map((item, index) => <button key={item.id} type="button" role="tab"
        ref={node => { tabs.current[index] = node; }} id={id + "-" + item.id}
        aria-selected={selected === index} aria-controls={id + "-panel-" + item.id} tabIndex={selected === index ? 0 : -1}
        onClick={() => setSelected(index)} onKeyDown={event => {
          let next = index;
          if (event.key === "ArrowRight") next = (index + 1) % PERSPECTIVES.length;
          else if (event.key === "ArrowLeft") next = (index + PERSPECTIVES.length - 1) % PERSPECTIVES.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = PERSPECTIVES.length - 1;
          else return;
          event.preventDefault(); setSelected(next); tabs.current[next]?.focus();
        }}><item.icon size={19} aria-hidden="true" />{item.label}</button>)}
    </div>
    {PERSPECTIVES.map((item, index) => <div key={item.id} id={id + "-panel-" + item.id} role="tabpanel" aria-labelledby={id + "-" + item.id} hidden={selected !== index} tabIndex={0}>
      {selected === index && <div className="rb-perspective-body" data-market={active.id}>
        <div className="rb-perspective-visual">
          <MarketDirectionScene active={active.id} id={`${id}-directions`} />
        </div>
        <div className="rb-perspective-copy"><p className="rb-home-eyebrow">Setup lifecycle</p><h3>{active.title}</h3><p>{active.description}</p>
          <ol>{active.checks.map((check, i) => <li key={check}><span>0{i + 1}</span>{check}</li>)}</ol>
          <a className="rb-home-text-link" href={active.href}>{active.action}<ArrowRight size={17} aria-hidden="true" /></a>
        </div>
      </div>}
    </div>)}
  </div>;
}
