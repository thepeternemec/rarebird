import { ArrowDown, ArrowRight, ArrowUpRight, Braces, Cable } from "lucide-react";
import CopyButton from "@/components/site/copy-button";
import SiteFooter from "@/components/site/site-footer";
import SiteNav from "@/components/site/site-nav";
import AgentCallExplorer from "./agent-call-explorer";
import "./for-agents.css";

export const metadata = {
  title: "Rarebird for agents | MCP and REST",
  description: "Give your agent source-linked stock and crypto news, quotes, SEC filings, token data and market evidence through Rarebird’s MCP server or REST API.",
  alternates: { canonical: "/for-agents" },
};

const origin = "https://www.rarebird.network";
const tools = [
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
        <p className="rb-agent-label">Rarebird for agents</p>
        <h1 id="agent-title">The workspace your agent can read.</h1>
        <p className="rb-agent-lede">Get the source-linked stock and crypto coverage you see in Rarebird through MCP or REST. Bring headlines, prices, filings, and market evidence into the tools you already use.</p>
        <div className="rb-agent-actions">
          <a className="rb-agent-primary" href="/docs/quickstart">Connect with MCP <ArrowUpRight size={17} aria-hidden="true" /></a>
          <a className="rb-agent-secondary" href="#tool-explorer">Try a live request <ArrowDown size={17} aria-hidden="true" /></a>
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
        <p className="rb-agent-coverage-note">App stock quote widgets use TradingView. Agent calls return Rarebird reference quotes where available. Use REST <code>/v2/markets</code> for rankings and seven-day crypto price series when supplied.</p>
      </section>

      <section className="rb-agent-section" aria-labelledby="agent-connect-heading">
        <div className="rb-agent-section-head"><h2 id="agent-connect-heading">Connect Rarebird</h2></div>
        <div className="rb-agent-connect">
          <article>
            <Cable size={22} aria-hidden="true" />
            <h3>MCP server</h3>
            <p>Add the remote server to an assistant that supports MCP. Public tools are available without a Rarebird API key.</p>
            <div className="rb-agent-endpoint"><code>{origin}/api/mcp</code><CopyButton text={origin + "/api/mcp"} label="Copy MCP URL" /></div>
            <a className="rb-agent-secondary" href="/docs/quickstart">MCP setup guide <ArrowRight size={16} aria-hidden="true" /></a>
          </article>
          <article>
            <Braces size={22} aria-hidden="true" />
            <h3>REST API</h3>
            <p>Use the same capabilities from your own agent, script, or application. Responses expose source and coverage information where available.</p>
            <div className="rb-agent-endpoint"><code>{origin}/api</code><CopyButton text={origin + "/api"} label="Copy REST URL" /></div>
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
