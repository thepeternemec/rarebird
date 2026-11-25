import { redirect } from "next/navigation";
import { legacyMarketDestination } from "@/lib/legacy-market-link";
import { ArrowRight, ArrowUpRight, ChevronDown, Radio, Terminal } from "lucide-react";
import SiteNav from "@/components/site/site-nav";
import SiteFooter from "@/components/site/site-footer";
import { AgentDelivery, AlertDetails, ScreeningPreview, SetupTimeline } from "@/components/site/home-signal-visuals";
import StockScreeningActivity from "@/components/site/signal-graph";
import StockPilotReadiness from "@/components/site/stock-pilot-readiness";
import CopyButton from "@/components/site/copy-button";
import { RAREBIRD_MCP_URL } from "@/components/site/connection-details";
import { EARLY_ACCESS_END } from "@/components/site/access-offer";
import "./rarebird-home.css";

const TITLE = "Rarebird — Your agent’s eyes on the stock market";
const DESCRIPTION = "Rarebird screens stocks for developing strength and unusual trading activity. Give your AI agent the setup, source context and updates when conditions change.";
const REPO = "https://github.com/thepeternemec/rarebird";
const FIRST_QUESTION = "Use Rarebird to show current stock setups. Explain why each qualifies and whether its data is current.";

export const metadata = {
  title: TITLE, description: DESCRIPTION, alternates: { canonical: "/" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/", siteName: "Rarebird", type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const QUESTIONS = [
  { question: "Where can I check current coverage?", answer: <>The <a href="/app/screener">stock screener</a> shows which stocks are tracked and whether the data feed is ready.</> },
  { question: "When does the screening run?", answer: "The pilot checks closed one-minute bars during the regular US trading session, once the stock feed is connected. It needs 66 aligned trading minutes to establish each day’s baseline. A closed market, incomplete baseline or stale feed is shown separately from a scan with no qualifying setup." },
  { question: "Does connecting MCP turn on notifications?", answer: "MCP gives your agent tools to read setups and follow changes. Automatic delivery requires a separately configured webhook endpoint. The agent guide explains both options, and the screener shows whether delivery is configured." },
  { question: "What should my agent do with an alert?", answer: "Use it as a prompt to investigate the stock, the measurements and the source context. Check that the setup is still current. The initial screening rules are experimental; a qualifying setup is not a return prediction. Rarebird does not place trades." },
];

export default async function Home({ searchParams }: { searchParams: Promise<{ beat?: string; market?: string }> }) {
  const { beat, market } = await searchParams;
  if (typeof beat === "string" || typeof market === "string") redirect(legacyMarketDestination(beat, market));
  return <>
    <SiteNav active="/" />
    <main className="rb-home">
      <section className="rb-home-hero rb-home-width" id="top" aria-labelledby="home-title">
        <div className="rb-home-hero-copy">
          <p className="rb-home-eyebrow"><span className="rb-home-dot" /> Stock screening, built for AI agents</p>
          <h1 id="home-title">Your agent’s<br /><span>eyes on the<br />stock market.</span></h1>
          <p className="rb-home-lede">Rarebird watches for stocks showing unusual strength and trading activity. It gives your AI agent a reason to investigate, then updates the setup as the market changes.</p>
          <div className="rb-home-actions">
            <a className="rb-home-button" href="/app/screener">Explore stock screener <ArrowUpRight size={17} aria-hidden="true" /></a>
            <a className="rb-home-text-link" href="#connect-agent">Connect your agent <ArrowRight size={16} aria-hidden="true" /></a>
          </div>
          <StockPilotReadiness />
        </div>
        <ScreeningPreview />
      </section>

      <section className="rb-home-section rb-home-width rb-home-how" id="signal-graph" aria-labelledby="how-title">
        <header className="rb-home-section-heading rb-home-heading-split"><div><p className="rb-home-eyebrow">How Rarebird works</p><h2 id="how-title">From developing move<br /><span>to agent alert.</span></h2></div><p>Rarebird checks a stock’s strength against the broader market, along with its volume and bid–ask spread. In this example, the squares brighten as those checks line up and a setup qualifies.</p></header>
        <StockScreeningActivity />
      </section>

      <section className="rb-home-section rb-home-benefits" id="agent-workflow" aria-labelledby="benefits-title"><div className="rb-home-width">
        <header className="rb-home-section-heading"><p className="rb-home-eyebrow">What your agent receives</p><h2 id="benefits-title">The evidence behind an alert.<br /><span>And what follows.</span></h2></header>
        <div className="rb-home-story-grid"><AlertDetails /><SetupTimeline /></div>
      </div></section>

      <section className="rb-home-section rb-home-width" id="connect-agent" aria-labelledby="start-title">
        <header className="rb-home-section-heading rb-home-heading-split"><div><p className="rb-home-eyebrow">Get started</p><h2 id="start-title">Open the screener.<br /><span>Or connect your agent.</span></h2></div><p>Explore setups in the browser, let your agent look them up over MCP, or set up automatic alerts with a webhook.</p></header>
        <AgentDelivery />
        <div className="rb-home-start-grid">
          <article className="rb-home-start"><Terminal size={23} strokeWidth={1.5} /><h3>Open the screener</h3><p>See current coverage and feed status. Open a setup to check the measurements that qualified it and follow its history.</p><a className="rb-home-text-link" href="/app/screener">Open stock screener <ArrowUpRight size={16} /></a></article>
          <article className="rb-home-start"><Radio size={23} strokeWidth={1.5} /><h3>Connect your AI agent</h3><p>Add Rarebird as a remote MCP server in a compatible assistant.</p><div className="rb-home-connection"><span>MCP connection URL</span><code>{RAREBIRD_MCP_URL}</code><CopyButton text={RAREBIRD_MCP_URL} label="Copy connection URL" className="rb-home-copy" /></div><div className="rb-home-first-question"><span>Then ask your agent</span><p>“{FIRST_QUESTION}”</p></div><a className="rb-home-text-link" href="/docs/connect#stock-screener">Agent setup &amp; notifications <ArrowRight size={16} /></a></article>
        </div>
        <p className="rb-home-offer">App and agent free through {EARLY_ACCESS_END}. <a href="/pricing">See pricing <ArrowUpRight size={13} /></a></p>
      </section>

      <section className="rb-home-section rb-home-width rb-home-questions" aria-labelledby="questions-title"><header className="rb-home-section-heading"><p className="rb-home-eyebrow">A few useful details</p><h2 id="questions-title">Know what you’re<br /><span>connecting to.</span></h2></header><div>{QUESTIONS.map(item => <details key={item.question}><summary>{item.question}<ChevronDown size={17} aria-hidden="true" /></summary><p>{item.answer}</p></details>)}</div></section>

      <section className="rb-home-build rb-home-width" id="build-history" aria-labelledby="build-title"><div><p className="rb-home-eyebrow">Built in the open</p><h2 id="build-title">Inspect the rules.</h2><p>The screening policy and measurement methods are public. You can see exactly what qualifies and how outcomes are recorded.</p></div><nav aria-label="Open-source project"><a href={REPO + "/blob/main/docs/STOCK-SCREENER.md"}>Screening rules <ArrowUpRight size={15} /></a><a href={REPO}>Source code <ArrowUpRight size={15} /></a><a href={REPO + "/commits/main/"}>Build history <ArrowUpRight size={15} /></a></nav></section>

    </main>
    <SiteFooter landing />
  </>;
}
