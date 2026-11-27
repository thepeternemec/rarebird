import { ArrowDown, ArrowRight, ArrowUpRight, Braces, Cable, ListChecks, MessageSquareText, Radio } from "lucide-react";
import CopyButton from "@/components/site/copy-button";
import SiteFooter from "@/components/site/site-footer";
import SiteNav from "@/components/site/site-nav";
import SignalTiles from "@/components/site/signal-tiles";
import AgentCallExplorer from "./agent-call-explorer";
import "./for-agents.css";

export const metadata = {
  title: "Rarebird for agents | MCP and REST",
  description: "Give your agent source-linked stock and crypto news, quotes, SEC filings, token data and market evidence through Rarebird’s MCP server or REST API.",
  alternates: { canonical: "/for-agents" },
};

const origin = "https://www.rarebird.network";
const tools = [
  { view: "Stock screener", detail: "Developing setups, screening measurements and updates as conditions change.", mcp: ["rarebird_stock_screener"], rest: ["GET /v2/stock-screener"] },
  { view: "News and signals", detail: "Grouped reporting, original links and publication times.", mcp: ["rarebird_stories", "rarebird_discovery"], rest: ["GET /v2/stories", "GET /v2/discovery"] },
  { view: "Prices and market data", detail: "Reference quotes, crypto prices, and ranked market snapshots.", mcp: ["rarebird_research", "rarebird_prices"], rest: ["POST /v2/research", "GET /v2/prices", "GET /v2/markets"] },
  { view: "Filings and reported figures", detail: "SEC disclosures and comparable reported periods for four issuers.", mcp: ["rarebird_catalysts"], rest: ["GET /v2/catalysts"] },
  { view: "Reviews and market evidence", detail: "Candidates, measured comparisons and checks for six pilot assets.", mcp: ["rarebird_opportunities", "rarebird_intelligence"], rest: ["GET /v2/opportunities", "GET /v2/intelligence"] },
  { view: "Forecasts and crypto indicators", detail: "BTC and ETH forecast scorecards, funding, DEX volume and sentiment.", mcp: ["rarebird_market_briefing", "rarebird_signals", "rarebird_fear_greed"], rest: ["GET /v2/forecasts", "GET /v2/signals", "GET /v2/sentiment"] },
  { view: "Token contracts", detail: "Exact-address DEX pools and issuer records where available.", mcp: ["rarebird_token_intelligence"], rest: ["GET /v2/tokens"] },
  { view: "Ticker briefs", detail: "A sourced brief with risks, coverage and what to check next.", mcp: ["rarebird_investment"], rest: ["POST /v2/investment"] },
];

export default function ForAgents() {
  return <>
    <SiteNav active="/for-agents" />
    <main className="rb-agent-page">
      <section className="rb-agent-hero" aria-labelledby="agent-title">
        <div>
          <p className="rb-agent-label">Rarebird for agents</p>
          <h1 id="agent-title">One connection.<br /><span>All of Rarebird’s tools.</span></h1>
          <p className="rb-agent-lede">Give your assistant access to stock setups, news, filings and market data through a single MCP connection. Public access needs no API key.</p>
          <div className="rb-agent-actions">
            <CopyButton text={origin + "/api/mcp"} label="Copy MCP connection URL" copiedLabel="MCP URL copied" className="rb-agent-primary" />
            <a className="rb-agent-secondary" href="/docs/quickstart">Setup instructions <ArrowUpRight size={17} aria-hidden="true" /></a>
          </div>
          <div className="rb-agent-endpoint"><code>{origin}/api/mcp</code></div>
          <p className="rb-agent-setup-note">In your assistant’s settings, add a remote MCP server named Rarebird and paste this URL.</p>
        </div>
        <div className="rb-agent-flow">
          <h2>From question to evidence</h2>
          <ol>
            <li><MessageSquareText aria-hidden="true" size={19} /><div><strong>You ask</strong><p>“What stock setups are developing?”</p></div></li>
            <li><Radio aria-hidden="true" size={19} /><div><strong>Your agent calls Rarebird</strong><code>rarebird_stock_screener</code></div></li>
            <li><ListChecks aria-hidden="true" size={19} /><div><strong>Rarebird returns the screening result</strong><p>Feed readiness and any active setups, with reasons and expiry.</p></div></li>
          </ol>
          <SignalTiles cells="010013211232243432234444" />
          <a className="rb-agent-secondary" href="#tool-explorer">Try a live request <ArrowDown size={16} aria-hidden="true" /></a>
        </div>
      </section>

      <AgentCallExplorer origin={origin} />

      <section className="rb-agent-section" id="coverage" aria-labelledby="agent-coverage-heading">
        <div className="rb-agent-section-head">
          <h2 id="agent-coverage-heading">From app view to tool call</h2>
          <a className="rb-agent-secondary" href="/docs/connect">Developer reference <ArrowUpRight size={16} aria-hidden="true" /></a>
        </div>
        <table className="rb-agent-coverage" role="table" aria-labelledby="agent-coverage-heading">
          <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">In the workspace</th><th scope="col" role="columnheader">MCP tool</th><th scope="col" role="columnheader">REST endpoint</th></tr></thead>
          <tbody role="rowgroup">{tools.map(row => <tr key={row.view} role="row">
            <th scope="row" role="rowheader"><strong>{row.view}</strong><span>{row.detail}</span></th>
            <td role="cell"><span className="rb-agent-mobile-label" aria-hidden="true">MCP</span>{row.mcp.map(tool => <code key={tool}>{tool}</code>)}</td>
            <td role="cell"><span className="rb-agent-mobile-label" aria-hidden="true">REST</span>{row.rest.map(route => <code key={route}>{route}</code>)}</td>
          </tr>)}</tbody>
        </table>
        <p className="rb-agent-coverage-note">Research stock quotes come from Alpaca. Read bid, ask, quote time and feed coverage through REST /v2/stock-quotes; the displayed midpoint is not a last-trade price. Use REST <code>/v2/markets</code> for rankings and seven-day crypto price series when supplied.</p>
      </section>

      <section className="rb-agent-section" aria-labelledby="agent-connect-heading">
        <div className="rb-agent-section-head"><h2 id="agent-connect-heading">Connect Rarebird</h2></div>
        <div className="rb-agent-connect">
          <article>
            <Cable size={22} aria-hidden="true" />
            <h3>One MCP server for your assistant</h3>
            <p>Add this URL once in your assistant’s remote MCP settings, name the connection Rarebird, and enable the tools. This connection includes every tool shown above. Public access needs no API key.</p>
            <div className="rb-agent-endpoint"><code>{origin}/api/mcp</code><CopyButton text={origin + "/api/mcp"} label="Copy MCP connection URL" copiedLabel="MCP URL copied" /></div>
            <a className="rb-agent-secondary" href="/docs/quickstart">MCP setup guide <ArrowRight size={16} aria-hidden="true" /></a>
          </article>
          <article>
            <Braces size={22} aria-hidden="true" />
            <h3>REST API for developers</h3>
            <p>Use the same capabilities from your own agent, script, or application. Responses expose source and coverage information where available.</p>
            <div className="rb-agent-endpoint"><code>{origin}/api</code><CopyButton text={origin + "/api"} label="Copy REST API base URL" copiedLabel="REST API base URL copied" /></div>
            <a className="rb-agent-secondary" href="/docs/connect#first-rest-requests">First REST requests <ArrowRight size={16} aria-hidden="true" /></a>
          </article>
        </div>
        <details className="rb-agent-collection" id="collection">
          <summary>How often is news collected?</summary>
          <p>The shared catalog is checked every ten minutes. On request, NVIDIA, Apple, Microsoft, Alphabet, Bitcoin, and Ethereum can be checked every minute for a 15-minute session.</p>
          <a href="/docs/connect#first-rest-requests">Read the collection controls <ArrowUpRight size={14} aria-hidden="true" /></a>
        </details>
      </section>
    </main>
    <SiteFooter />
  </>;
}
