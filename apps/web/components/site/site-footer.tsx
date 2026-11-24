import { ArrowUpRight } from "lucide-react";
import { BrandWordmark } from "./brand-mark";
import { EARLY_ACCESS_END } from "./access-offer";
import "./site-footer.css";

const links = [
  {
    title: "Product",
    items: [
      { href: "/app", label: "Open app" },
      { href: "/for-agents", label: "For agents" },
      { href: "/tokens", label: "Token contracts" },
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

export default function SiteFooter() {
  return <footer className="site rb-site-footer">
    <div className="wrap">
      <div className="rb-footer-grid">
        <div className="rb-footer-brand">
          <a className="rb-footer-wordmark" href="/" aria-label="Rarebird home">
            <BrandWordmark className="brand-wordmark" width={136} />
          </a>
          <p>Know what’s worth watching.</p>
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
