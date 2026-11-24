import type { ReactNode } from "react";
import { ChevronDown, FileText, Newspaper } from "lucide-react";
import SiteFooter from "./site-footer";
import { BrandWordmark } from "./brand-mark";
import MobileNavigation from "./mobile-navigation";
import ThemeToggle from "./theme-toggle";
import "./mobile-navigation.css";
import "./workspace-shell.css";

const PRIMARY = [
  { href: "/app", label: "News signals", icon: Newspaper },
  { href: "/app/research", label: "Reviews and filings", icon: FileText },
] as const;

const TOOLS = [
  { href: "/ask", label: "Ticker research", description: "Research a stock or token" },
  { href: "/app/asset-inspector", label: "Asset inspector", description: "Inspect evidence for a pilot asset" },
  { href: "/dashboard", label: "News map", description: "Explore reporting across the catalog" },
  { href: "/app/crypto-prices", label: "Crypto prices", description: "Open the full crypto price board" },
  { href: "/crypto", label: "Crypto indicators", description: "See funding, volume, sentiment and breadth" },
  { href: "/app/forecasts", label: "Forecasts", description: "Compare BTC and ETH forecasts with recorded outcomes" },
  { href: "/tokens", label: "Token contracts", description: "Look up an asset by chain and contract" },
  { href: "/docs/quickstart", label: "Connect an agent", description: "Use Rarebird through your AI assistant" },
] as const;

type WorkspacePath = (typeof PRIMARY)[number]["href"] | (typeof TOOLS)[number]["href"];

export default function WorkspaceShell({ active, title, description, children }: {
  active: WorkspacePath;
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return <>
    <div className="rb-app">
      <a className="rb-app-skip" href="#workspace-content">Skip to workspace content</a>
      <header className="rb-workspace-header">
        <a className="nav-logo" href="/" aria-label="Rarebird home"><BrandWordmark className="brand-wordmark" /></a>
        <nav className="rb-app-nav" aria-label="Rarebird workspace" data-tool-active={TOOLS.some(tool => tool.href === active)}>
          {PRIMARY.map(({ href, label, icon: Icon }) => (
            <a key={href} href={href} aria-current={href === active ? "page" : undefined}>
              <Icon size={18} aria-hidden="true" /><span>{label}</span>
            </a>
          ))}
          <MobileNavigation links={TOOLS.map(tool => tool.href === "/crypto" ? { ...tool, href: "/crypto#indicators" } : tool)} active={active} variant="workspace" />
        </nav>
        <ThemeToggle />
      </header>
      <main className="rb-app-main" id="workspace-content">
        {title && <header className="rb-app-heading">
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </header>}
        {children}
      </main>
    </div>
    <SiteFooter />
  </>;
}

export function WorkspaceEvidence({ title, children }: { title: string; children: ReactNode }) {
  return <details className="rb-app-evidence">
    <summary>{title}<ChevronDown size={16} aria-hidden="true" /></summary>
    <div>{children}</div>
  </details>;
}
