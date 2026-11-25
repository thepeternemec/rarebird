import { ArrowRight, Check, Code2, Plug } from "lucide-react";
import CopyButton from "@/components/site/copy-button";
import DocsMcpConnection from "@/components/site/docs-mcp-connection";
import { RAREBIRD_FIRST_QUESTION } from "@/components/site/connection-details";

export const metadata = {
  title: "Get started with Rarebird",
  description: "Connect your AI assistant to Rarebird, ask your first market question, or build with the API. Clear setup steps and copyable examples.",
};

const QUESTIONS = [
  { label: "Recent news", text: RAREBIRD_FIRST_QUESTION },
  { label: "Company research", text: "Use Rarebird to research NVIDIA. What changed recently, and what is still uncertain?" },
];

export default function DocsOverview() {
  return <div className="docs-onboarding docs-overview">
    <header className="docs-head">
      <span className="sec-eyebrow">Documentation</span>
      <h1>Get started with Rarebird.</h1>
      <p className="docs-lead">Give your AI assistant access to recent stock and crypto news, research and market data. Connect once, then ask in your own words.</p>
      <div className="docs-free-note"><Check size={14} aria-hidden="true" /> Free public access <span>·</span> No Rarebird account or API key</div>
    </header>

    <section className="docs-section" aria-labelledby="choose-your-path">
      <h2 id="choose-your-path">How do you want to use Rarebird?</h2>
      <div className="docs-start-grid">
        <a className="docs-path-card docs-path-primary" href="/docs/quickstart">
          <span className="docs-path-icon"><Plug size={20} aria-hidden="true" /></span>
          <span className="docs-path-label">For assistant users</span>
          <h3>Connect your AI agent</h3>
          <p>Follow the steps for Claude, ChatGPT, Cursor, Codex or another MCP client.</p>
          <span className="docs-path-action">Start setup <ArrowRight size={16} aria-hidden="true" /></span>
        </a>
        <a className="docs-path-card" href="/docs/connect#first-rest-requests">
          <span className="docs-path-icon"><Code2 size={20} aria-hidden="true" /></span>
          <span className="docs-path-label">For developers</span>
          <h3>Build with the API</h3>
          <p>Copy a working request, choose a tool and handle the response in your app.</p>
          <span className="docs-path-action">Open API examples <ArrowRight size={16} aria-hidden="true" /></span>
        </a>
      </div>
      <p className="docs-small docs-inline-note">Want to try Rarebird first? <a href="/docs/try">Ask a question in your browser</a>. No setup needed.</p>
    </section>

    <section className="docs-section" aria-labelledby="connection">
      <h2 id="connection">Already know how to add an MCP server?</h2>
      <p>Use this URL in your assistant’s connection settings. MCP is the standard that lets your assistant call Rarebird’s tools.</p>
      <DocsMcpConnection />
      <a className="docs-text-action" href="/docs/quickstart">Show me where to paste it <ArrowRight size={16} aria-hidden="true" /></a>
    </section>

    <section className="docs-section" aria-labelledby="questions-to-ask">
      <h2 id="questions-to-ask">Then ask your first question</h2>
      <div className="docs-prompt-grid">{QUESTIONS.map(question => <div className="docs-prompt-card" key={question.label}>
        <span>{question.label}</span><p>“{question.text}”</p><CopyButton text={question.text} label="Copy question" />
      </div>)}</div>
      <p className="docs-small">A working connection shows a Rarebird tool call and returns sources and dates. If data is missing or old, your assistant should say so.</p>
    </section>

    <section className="docs-section" aria-labelledby="what-to-expect">
      <h2 id="what-to-expect">What Rarebird gives you</h2>
      <div className="docs-facts">
        <div><h3>News and research</h3><p>Recent headline metadata, source links and answers grounded in the available evidence. Full article text is not included.</p></div>
        <div><h3>Market context</h3><p>Reference prices and market readings where available. Detailed signal measurements cover a smaller pilot.</p></div>
        <div><h3>Clear coverage</h3><p>The news catalog covers 2,030 stocks and crypto assets. Availability varies. <a href="/docs/data">Check coverage and freshness</a>.</p></div>
        <div><h3>Lookups when you ask</h3><p>Your assistant chooses the tools. Scheduled briefings require a schedule in your assistant or workflow.</p></div>
      </div>
      <a className="docs-text-action" href="/docs/quickstart">Connect your agent <ArrowRight size={16} aria-hidden="true" /></a>
    </section>
  </div>;
}

