import Image from "next/image";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { KUMO_FEEDS } from "@rarebird/contracts";

const MEASUREMENTS = "https://github.com/thepeternemec/rarebird/actions/workflows/btc-kumo.yml";

export function KumoEngineAnnouncement() {
  return <a className="rb-kumo-announcement" href="#kumo-engine">
    <span className="rb-kumo-announcement-tag">BTC pilot</span>
    <span>Built with <strong>NVIDIA Kumo Engine</strong></span>
    <ArrowDownRight size={16} aria-hidden="true" />
  </a>;
}

export default function KumoEngineSection() {
  return <section className="rb-kumo rb-home-width" id="kumo-engine" aria-labelledby="kumo-title">
    <div className="rb-kumo-main">
      <div className="rb-kumo-copy">
        <p className="rb-home-eyebrow">Built with NVIDIA Kumo Engine</p>
        <h2 id="kumo-title">Connected context.<br /><span>Measured predictions.</span></h2>
        <p className="rb-kumo-description">Rarebird brings headlines, news signals and market data into a shared graph. NVIDIA Kumo Engine uses that context to train and test our experimental BTC models.</p>
        <p className="rb-kumo-direction">Bitcoin is our first target. We’re building toward more asset classes, with every model measured against a baseline.</p>
        <div className="rb-kumo-links">
          <a className="rb-home-text-link" href="/docs/connect#btc-experiment">Explore the integration <ArrowUpRight size={16} aria-hidden="true" /></a>
          <a className="rb-home-text-link" href={MEASUREMENTS} target="_blank" rel="noopener noreferrer">See the measurements <ArrowUpRight size={16} aria-hidden="true" /></a>
        </div>
      </div>
      <figure className="rb-kumo-brand" aria-label="NVIDIA Kumo Engine, used in Rarebird’s BTC research pilot">
        <div className="rb-kumo-brand-label"><span aria-hidden="true" /> The engine behind the experiment</div>
        <div className="rb-kumo-brand-surface">
          <Image src="/brand/nvidia-logo-horiz.svg" alt="NVIDIA" width={2560} height={1440} unoptimized className="rb-kumo-logo" />
          <p className="rb-kumo-engine-name">Kumo Engine</p>
          <span className="rb-kumo-brand-caption">Context generation over structured data</span>
        </div>
        <figcaption>Real data. Published measurements.<br />More asset classes ahead.</figcaption>
      </figure>
    </div>
    <dl className="rb-kumo-facts">
      <div><dt>{KUMO_FEEDS.length}</dt><dd>Feed types connected</dd></div>
      <div><dt>BTC</dt><dd>First prediction target</dd></div>
      <div><dt>Hourly</dt><dd>Model comparisons</dd></div>
    </dl>
    <p className="rb-kumo-trademark">NVIDIA and the NVIDIA logo are trademarks of NVIDIA Corporation.</p>
  </section>;
}
