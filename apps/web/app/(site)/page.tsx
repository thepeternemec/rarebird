import { redirect } from "next/navigation";
import { legacyMarketDestination } from "@/lib/legacy-market-link";
import { ArrowRight, ArrowUpRight, Bell, Check, ChevronDown, Radio, Terminal } from "lucide-react";
import SiteNav from "@/components/site/site-nav";
import SiteFooter from "@/components/site/site-footer";
import BrandMark from "@/components/site/brand-mark";
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

const BENEFITS = [
  { number: "01", title: "Know which stock deserves a closer look.",
    text: "Each setup names the stock and shows why it qualified: strength relative to the wider market, unusual volume and an acceptable spread. The reference measurements and check time stay attached.",
    detail: "A clear reason to investigate" },
  { number: "02", title: "Give your agent context it can check.",
    text: "Recent reporting comes with original links and publication times when available. Your agent can inspect the evidence and ask a better follow-up question. A nearby headline does not prove why a price moved.",
    detail: "Source context, with its limits" },
  { number: "03", title: "Follow the setup beyond the first alert.",
    text: "Your agent can see when a setup is active, held by missing data, invalidated or expired. The same ID connects its history. Forward observations after 15 and 60 minutes show what followed, including failed setups.",
    detail: "Updates and an outcome record" },
];
const QUESTIONS = [
  { question: "Which stocks does Rarebird watch?", answer: "The first screener follows NVIDIA (NVDA), Apple (AAPL), Microsoft (MSFT) and Alphabet (GOOGL) US shares, using SPY as the broad-market benchmark. More stocks and screening strategies are planned. The screener shows its current feed coverage and readiness." },
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
        <aside className="rb-home-alert-example" aria-label="Illustrative agent alert">
          <header><span><BrandMark size={22} /> rarebird <i>/</i> stock watch</span><span>Example alert · Not live</span></header>
          <div className="rb-home-example-body"><span className="rb-home-example-type"><Bell size={13} /> SETUP DETECTED</span><h2>NVDA is showing<br />unusual strength.</h2><p>A stock your agent should investigate.</p>
            <dl><div><dt><Check size={14} /> Strength versus the market</dt><dd>Stands out</dd></div><div><dt><Check size={14} /> Traded volume</dt><dd>Above baseline</dd></div><div><dt><Check size={14} /> Observed spread</dt><dd>Within limit</dd></div></dl>
            <div className="rb-home-example-context"><span>CONTEXT ATTACHED</span><p>Reference measurements, recent source links when available, and when the setup expires.</p></div>
          </div>
          <footer><span>Rarebird <ArrowRight size={14} /> Your agent</span><span>Same setup ID. Every update.</span></footer>
        </aside>
      </section>

      <div className="rb-home-scope rb-home-width" aria-label="First stock pilot coverage"><span>STARTING WITH</span><div><strong>NVDA</strong><span>NVIDIA</span></div><div><strong>AAPL</strong><span>Apple</span></div><div><strong>MSFT</strong><span>Microsoft</span></div><div><strong>GOOGL</strong><span>Alphabet</span></div><p>US shares<br /><span>Compared with SPY</span></p></div>

      <section className="rb-home-section rb-home-width rb-home-how" id="signal-graph" aria-labelledby="how-title">
        <header className="rb-home-section-heading rb-home-heading-split"><div><p className="rb-home-eyebrow">How Rarebird works</p><h2 id="how-title">From developing move<br /><span>to agent alert.</span></h2></div><p>Watch the squares build into a signal as strength, volume and spread line up. When a setup qualifies, Rarebird can send it to your agent.</p></header>
        <StockScreeningActivity />
      </section>

      <section className="rb-home-section rb-home-benefits" id="agent-workflow" aria-labelledby="benefits-title"><div className="rb-home-width">
        <header className="rb-home-section-heading rb-home-heading-split"><div><p className="rb-home-eyebrow">What your agent receives</p><h2 id="benefits-title">The stock. The reason.<br /><span>What changes next.</span></h2></div><p>A useful market alert needs more than a ticker and a price move. Rarebird keeps the measurements, context and lifecycle together.</p></header>
        <ol className="rb-home-benefit-list">{BENEFITS.map(item => <li key={item.number}><span>{item.number}</span><h3>{item.title}</h3><div><p>{item.text}</p><span>{item.detail}</span></div></li>)}</ol>
      </div></section>

      <section className="rb-home-section rb-home-width" id="connect-agent" aria-labelledby="start-title">
        <header className="rb-home-section-heading"><p className="rb-home-eyebrow">Start here</p><h2 id="start-title">Use the screen yourself.<br /><span>Bring your agent along.</span></h2><p>See the current pilot in your browser, or give a compatible assistant access through one Rarebird connection.</p></header>
        <div className="rb-home-start-grid">
          <article className="rb-home-start"><Terminal size={23} strokeWidth={1.5} /><h3>Open the screener</h3><p>See current coverage, inspect a setup and follow its history.</p><ol><li><span>1</span>Check the four tracked stocks and feed status.</li><li><span>2</span>Open a setup to see why it qualified.</li><li><span>3</span>Follow updates and the 15 / 60-minute outcomes.</li></ol><a className="rb-home-text-link" href="/app/screener">Open stock screener <ArrowUpRight size={16} /></a></article>
          <article className="rb-home-start rb-home-start-agent"><Radio size={23} strokeWidth={1.5} /><h3>Connect your AI agent</h3><p>Add Rarebird as a remote MCP server in a compatible assistant.</p><div className="rb-home-connection"><span>MCP CONNECTION URL</span><code>{RAREBIRD_MCP_URL}</code><CopyButton text={RAREBIRD_MCP_URL} label="Copy connection URL" className="rb-home-copy" /></div><div className="rb-home-first-question"><span>THEN ASK YOUR AGENT</span><p>“{FIRST_QUESTION}”</p></div><a className="rb-home-text-link" href="/docs/connect#stock-screener">Agent setup &amp; notifications <ArrowRight size={16} /></a><p className="rb-home-delivery-note">For automatic updates, configure a webhook destination. Connecting MCP gives your agent read access; notification setup is separate.</p></article>
        </div>
        <p className="rb-home-offer">App and agent free through {EARLY_ACCESS_END}. <a href="/pricing">See pricing <ArrowUpRight size={13} /></a></p>
      </section>

      <section className="rb-home-section rb-home-width rb-home-questions" aria-labelledby="questions-title"><header className="rb-home-section-heading"><p className="rb-home-eyebrow">A few useful details</p><h2 id="questions-title">Know what you’re<br /><span>connecting to.</span></h2></header><div>{QUESTIONS.map(item => <details key={item.question}><summary>{item.question}<ChevronDown size={17} aria-hidden="true" /></summary><p>{item.answer}</p></details>)}</div></section>

      <section className="rb-home-build rb-home-width" id="build-history" aria-labelledby="build-title"><div><p className="rb-home-eyebrow">Built in the open</p><h2 id="build-title">Inspect the rules.</h2><p>The screening policy and measurement methods are public. You can see exactly what qualifies and how outcomes are recorded.</p></div><nav aria-label="Open-source project"><a href={REPO + "/blob/main/docs/STOCK-SCREENER.md"}>Screening rules <ArrowUpRight size={15} /></a><a href={REPO}>Source code <ArrowUpRight size={15} /></a><a href={REPO + "/commits/main/"}>Build history <ArrowUpRight size={15} /></a></nav></section>

    </main>
    <SiteFooter landing />
  </>;
}
