import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import SiteFooter from "./site-footer";
import { BrandWordmark } from "./brand-mark";
import ThemeToggle from "./theme-toggle";
import "./workspace-shell.css";

export default function WorkspaceShell({ active, title, description, children }: {
  active: "/app" | "/tokens";
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return <>
    <div className="rb-app">
      <a className="rb-app-skip" href="#workspace-content">Skip to workspace content</a>
      <header className="rb-workspace-header">
        <a className="nav-logo" href="/" aria-label="Rarebird home"><BrandWordmark className="brand-wordmark" /></a>
        <nav className="rb-app-nav" aria-label="Rarebird workspace">
          {active === "/app" ? <Link href="/tokens">Token contracts</Link> : <Link href="/app?market=crypto">Crypto workspace</Link>}
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
