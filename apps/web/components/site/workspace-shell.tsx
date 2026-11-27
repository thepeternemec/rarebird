import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import SiteFooter from "./site-footer";
import BrandMark, { BrandWordmark } from "./brand-mark";
import ThemeToggle from "./theme-toggle";
import MobileNavigation from "./mobile-navigation";
import { AGENT_SETUP_HREF, NAVIGATION_LINKS, WORKSPACE_LINKS } from "@/lib/navigation";
import "./mobile-navigation.css";
import "./workspace-shell.css";

export default function WorkspaceShell({ active, title, description, children }: {
  active: "/app/research" | "/app/screener" | "/tokens";
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return <>
    <div className="rb-app">
      <a className="rb-app-skip" href="#workspace-content">Skip to workspace content</a>
      <header className="rb-workspace-header">
        <div className="rb-workspace-header-inner">
          <a className="rb-workspace-brand" href="/" aria-label="Rarebird home"><BrandMark className="rb-workspace-emblem" size={32} /><BrandWordmark className="brand-wordmark" width={122} /></a>
          <nav className="rb-app-nav" aria-label="Rarebird workspace">
            {WORKSPACE_LINKS.map(link => <Link key={link.href} href={link.href} aria-current={active === link.href ? "page" : undefined}>{link.label}</Link>)}
          </nav>
          <div className="rb-workspace-header-actions">
            <Link className="rb-workspace-docs" href="/docs">Docs</Link>
            <Link className="rb-workspace-guide" href={AGENT_SETUP_HREF}>Connect your agent <ArrowUpRight size={14} aria-hidden="true" /></Link>
            <ThemeToggle />
            <MobileNavigation variant="workspace" links={NAVIGATION_LINKS} active={active} />
          </div>
        </div>
      </header>
      <main className="rb-app-main" id="workspace-content">
        {title && <header className="rb-app-heading">
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </header>}
        {children}
      </main>
    </div>
    <SiteFooter workspace />
  </>;
}

export function WorkspaceEvidence({ title, children }: { title: string; children: ReactNode }) {
  return <details className="rb-app-evidence">
    <summary>{title}<ChevronDown size={16} aria-hidden="true" /></summary>
    <div>{children}</div>
  </details>;
}
