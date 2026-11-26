import { ArrowUpRight } from "lucide-react";
import BrandMark, { BrandWordmark } from "./brand-mark";
import { EARLY_ACCESS_END } from "./access-offer";
import FooterSignalMark from "./footer-signal-mark";
import "./site-footer.css";

const links = [
  {
    title: "Product",
    items: [
      { href: "/app", label: "Open app" },
      { href: "/for-agents", label: "For agents" },
      { href: "/app/screener", label: "Stock screener" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Developers",
    items: [
      { href: "/docs/quickstart", label: "Quickstart" },
      { href: "/docs", label: "Documentation" },
      { href: "/keys", label: "Get a key" },
      { href: "/llms", label: "llms.txt" },
    ],
  },
  {
    title: "Resources",
    items: [
      { href: "/status", label: "Service status" },
      { href: "/#build-history", label: "Build history" },
      { href: "/faq", label: "FAQ" },
    ],
  },
  {
    title: "Legal",
    items: [
      { href: "/legal/terms", label: "Terms" },
      { href: "/legal/cookies", label: "Cookies" },
      { href: "mailto:contact@rarebird.network", label: "Contact" },
    ],
  },
] as const;

export default function SiteFooter({ landing = false, compact = false }: { landing?: boolean; compact?: boolean }) {
  return <footer className={`site rb-site-footer${landing ? " rb-site-footer-landing" : ""}`}>
    <div className="wrap">
      {landing && (
        <section className="rb-footer-banner" id="community" aria-labelledby="closing-title">
          <div className="rb-footer-banner-copy">
            <h2 id="closing-title">See what deserves<br /> <span>a closer look.</span></h2>
            <a className="rb-footer-banner-cta" href="/app/screener">
              Explore the stock screener <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </div>
          <FooterSignalMark />
        </section>
      )}
      <div className="rb-footer-grid">
        <div className={compact ? "rb-footer-brand" : "rb-footer-brand rb-footer-brand-stacked"}>
          <a className="rb-footer-home" href="/" aria-label="Rarebird home">
            <BrandMark className="rb-footer-emblem" size={compact ? 38 : 44} />
            {compact ? <span>Rarebird</span> : <BrandWordmark width={116} />}
          </a>
          <p>{compact ? "Stock setups. Agent alerts." : "Your agent’s eyes on the stock market."}</p>
        </div>
        <div className="rb-footer-links">
          {links.map(group => <nav key={group.title} aria-label={"Footer " + group.title}>
            <span className="rb-footer-group-title">{group.title}</span>
            <ul>{group.items.map(item => <li key={item.href}><a href={item.href}>{item.label}</a></li>)}</ul>
          </nav>)}
        </div>
      </div>
      <div className="rb-footer-meta">
        <p>App and agent free through {EARLY_ACCESS_END}</p>
        <a href="https://github.com/thepeternemec/rarebird" aria-label="Rarebird on GitHub">Open source on GitHub <ArrowUpRight size={14} aria-hidden="true" /></a>
      </div>
    </div>
  </footer>;
}
