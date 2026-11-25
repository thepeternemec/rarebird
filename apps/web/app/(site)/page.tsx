import { redirect } from "next/navigation";
import { legacyMarketDestination } from "@/lib/legacy-market-link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Bot, Radio, Terminal } from "lucide-react";
import SiteNav from "@/components/site/site-nav";
import SiteFooter from "@/components/site/site-footer";
import BrandMark, { BrandWordmark } from "@/components/site/brand-mark";
import MarketPerspective from "@/components/site/market-perspective";
import SignalGraph from "@/components/site/signal-graph";
import StockPilotReadiness from "@/components/site/stock-pilot-readiness";
import { EARLY_ACCESS_END } from "@/components/site/access-offer";
import "./rarebird-home.css";

const TITLE = "Rarebird — Stock opportunity screener for AI agents";
const DESCRIPTION = "Screen stocks for developing setups. Give your AI agent relative-strength checks, source context, setup updates and measured outcomes.";
const REPO = "https://github.com/thepeternemec/rarebird";

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/", siteName: "Rarebird", type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const RESEARCH_PATHS = [
  {
    name: "Detect the setup",
    title: "A move worth investigating.",
    description: "Look for strength relative to SPY, unusual traded volume and a reasonable spread. A rising price alone is not enough. Already extended moves do not create a fresh setup.",
    href: "/app/screener",
    action: "Explore stock setups",
  },
  {
    name: "Keep your agent informed",
    title: "The update matters as much as the alert.",
    description: "Give your agent a stable setup ID, the measurements and recent source-linked reporting. Follow changes through MCP or receive signed events at a configured webhook when a setup pauses, resumes, fades or expires.",
    href: "/docs/connect#stock-screener",
    action: "Connect your agent",
  },
  {
    name: "Measure the follow-through",
    title: "Did the setup hold up?",
    description: "Keep the original stock and benchmark reference, then observe what happens after 15 and 60 minutes. Failed setups and missing observations stay in the record.",
    href: "/docs/connect#stock-screener",
    action: "Understand the outcomes",
  },
];

export default async function Home({ searchParams }: {
  searchParams: Promise<{ beat?: string; market?: string }>;
}) {
  const { beat, market } = await searchParams;
  if (typeof beat === "string" || typeof market === "string") {
    redirect(legacyMarketDestination(beat, market));
  }
  return <>
    <SiteNav active="/" />
    <main className="rb-home">
      <section className="rb-home-hero rb-home-width" id="top" aria-labelledby="home-title">
        <div className="rb-home-hero-copy">
          <p className="rb-home-eyebrow"><span className="rb-home-dot" /> Stock opportunity screener for AI agents</p>
          <h1 id="home-title">Your agent’s<br /><span>eyes on the<br className="rb-home-desktop-break" /> stock market.</span></h1>
          <p className="rb-home-lede">Rarebird screens stocks for developing strength and unusual volume. Give your agent the setup, the source context, and an update when conditions change.</p>
          <div className="rb-home-actions">
            <a className="rb-home-button" href="/app/screener">Explore stock screener <ArrowUpRight size={19} aria-hidden="true" /></a>
            <a className="rb-home-text-link" href="/docs/connect#stock-screener">Connect your agent <ArrowRight size={17} aria-hidden="true" /></a>
          </div>
          <p className="rb-home-access">First pilot: NVDA · AAPL · MSFT · GOOGL. Benchmark: SPY.</p>
          <StockPilotReadiness />
          <a className="rb-home-text-link rb-home-graph-link" href="#signal-graph">How the stock screen works <ArrowRight size={15} aria-hidden="true" /></a>
        </div>
        <div className="rb-home-sculpture" aria-hidden="true">
          <div className="rb-home-sculpture-grid" />
          <div className="rb-home-orbit rb-home-orbit-outer" />
          <div className="rb-home-orbit rb-home-orbit-inner" />
          <svg className="rb-home-paths" viewBox="0 0 560 560" fill="none">
            <path className="rb-home-path-shadow" d="M25 390 155 390 225 320 320 225 390 155 520 155" />
            <path className="rb-home-path-shadow" d="M25 170 155 170 225 240 320 335 390 405 520 405" />
            <path className="rb-home-path-up" d="M25 390 155 390 225 320 320 225 390 155 520 155" pathLength="1" />
            <path className="rb-home-path-down" d="M25 170 155 170 225 240 320 335 390 405 520 405" pathLength="1" />
            <path d="m508 143 12 12-12 12M508 393l12 12-12 12" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="25" cy="390" r="4" fill="currentColor" /><circle cx="25" cy="170" r="4" fill="currentColor" />
          </svg>
          <div className="rb-home-emblem"><BrandMark size={230} /></div>
          <span className="rb-home-direction rb-home-direction-up"><ArrowUpRight size={20} /> Spot the setup</span>
          <span className="rb-home-direction rb-home-direction-down"><ArrowDownRight size={20} /> Track the change</span>
        </div>
      </section>

      <section className="rb-signal-section rb-home-width" id="signal-graph" aria-labelledby="signal-graph-title">
        <header className="rb-signal-heading">
          <div>
            <p className="rb-home-eyebrow">How Rarebird works</p>
            <h2 id="signal-graph-title">From developing move<br /><span>to agent alert.</span></h2>
          </div>
          <p>See what passes the stock screen, what reaches your agent, and what gets measured afterward. Select a node to explore each step. Reporting adds context; it does not prove the cause of a move.</p>
        </header>
        <SignalGraph />
      </section>

      <section className="rb-home-section rb-home-width rb-home-platform" id="agent-workflow" aria-labelledby="platform-title">
        <header className="rb-home-section-heading">
          <p className="rb-home-eyebrow">The app and the agent</p>
          <h2 id="platform-title">One stock screen.<br /><span>You and your agent.</span></h2>
        </header>
        <div className="rb-home-product-grid">
          <article className="rb-home-product-card">
            <Terminal size={24} strokeWidth={1.4} aria-hidden="true" />
            <h3>See the current setups</h3>
            <p>See which stocks pass the screen, why they qualify, and when the measurements expire. Follow each setup through its history and outcomes.</p>
            <a className="rb-home-text-link" href="/app/screener">Open stock screener <ArrowUpRight size={17} aria-hidden="true" /></a>
          </article>
          <article className="rb-home-product-card">
            <Bot size={24} strokeWidth={1.4} aria-hidden="true" />
            <h3>Put your agent on watch</h3>
            <p>Use one MCP connection to read setups and follow their changes. For automatic delivery to your own agent, configure a signed webhook. The same setup ID follows the full lifecycle.</p>
            <a className="rb-home-text-link" href="/docs/connect#stock-screener">Set up stock alerts <ArrowUpRight size={17} aria-hidden="true" /></a>
          </article>
        </div>
        <p className="rb-home-offer">App and agent free through {EARLY_ACCESS_END}. <a href="/pricing">See pricing <ArrowRight size={15} aria-hidden="true" /></a></p>
      </section>

      <section className="rb-home-section rb-home-capabilities" id="connect-agent" aria-labelledby="tools-title">
        <div className="rb-home-width">
          <header className="rb-home-section-heading">
            <p className="rb-home-eyebrow">Screen. Notify. Measure.</p>
            <h2 id="tools-title">Less scanning.<br /><span>More to investigate.</span></h2>
          </header>
          <div className="rb-home-capability-list">
            {RESEARCH_PATHS.map(item => <article className="rb-home-capability" key={item.name}>
              <div><p className="rb-home-eyebrow">{item.name}</p><h3>{item.title}</h3></div>
              <div><p>{item.description}</p><a className="rb-home-text-link" href={item.href}>{item.action} <ArrowUpRight size={17} aria-hidden="true" /></a></div>
            </article>)}
          </div>
          <p className="rb-home-roadmap"><strong>Starting with four US stocks.</strong> Regular-session screening on closed one-minute bars. Feed coverage, readiness and notification status are shown in the screener. More stocks and screening strategies are planned.</p>
        </div>
      </section>

      <section className="rb-home-section rb-home-width" id="market-perspective" aria-labelledby="perspective-title">
        <header className="rb-home-section-heading">
          <p className="rb-home-eyebrow">Know when to investigate</p>
          <h2 id="perspective-title">A setup changes.<br /><span>Your agent should know.</span></h2>
        </header>
        <MarketPerspective />
      </section>

      <section className="rb-home-build rb-home-width" id="build-history" aria-labelledby="build-title">
        <div><p className="rb-home-eyebrow">Built in the open</p><h2 id="build-title">Check how it works.</h2><p>Inspect the stock-screening rules, see how outcomes are measured, and follow the work as it ships.</p></div>
        <nav aria-label="Open-source project"><a href={REPO}>Explore the code <ArrowUpRight size={17} aria-hidden="true" /></a><a href={REPO + "/commits/main/"}>See the build history <ArrowUpRight size={17} aria-hidden="true" /></a><a href={REPO + "/blob/main/docs/STOCK-SCREENER.md"}>Read the screening rules <ArrowUpRight size={17} aria-hidden="true" /></a></nav>
      </section>

      <section className="rb-home-close rb-home-width" id="community" aria-labelledby="closing-title">
        <h2 id="closing-title">Give your agent<br /><span>a market watch.</span></h2>
        <a className="rb-home-button" href="/app/screener">Explore the stock screener <Radio size={18} aria-hidden="true" /></a>
        <div className="rb-home-signature" role="img" aria-label="Rarebird"><BrandWordmark width={1040} /></div>
      </section>
    </main>
    <SiteFooter />
  </>;
}
