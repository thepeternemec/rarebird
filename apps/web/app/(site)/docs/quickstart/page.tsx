import { ArrowUpRight, Check } from "lucide-react";
import CopyButton from "@/components/site/copy-button";
import AgentInstructions from "@/components/site/agent-instructions";
import DocsMcpConnection from "@/components/site/docs-mcp-connection";
import DocsAgentSetup from "@/components/site/docs-agent-setup";
import { RAREBIRD_FIRST_QUESTION } from "@/components/site/connection-details";

export const metadata = {
  title: "Connect your AI agent to Rarebird",
  description: "Copy Rarebird’s MCP URL, follow the setup for Claude, ChatGPT, Cursor or Codex, and test your first lookup. No Rarebird account or API key needed.",
};

const HELP = [
  { question: "Where do I paste the connection URL?", answer: <>In your assistant’s remote MCP server settings. Choose your assistant above for the exact steps. Pasting the URL into an ordinary chat message does not enable Rarebird.</> },
  { question: "Do I need a Rarebird account or API key?", answer: <>Public MCP access needs neither. Choose <strong>None</strong> or <strong>No authentication</strong> when asked. Your assistant may have its own subscription or workspace requirements.</> },
  { question: "My assistant answers without using Rarebird", answer: <>Enable Rarebird for the conversation and ask it to “use Rarebird” explicitly. Look for a tool call. If the connector is unavailable, check your assistant’s account and workspace permissions.</> },
  { question: "The connection works but a lookup is empty", answer: <>Try the asset’s full name or ticker, and ask for its coverage and last successful check time. An empty result can mean there are no recent matching headlines. <a href="/status">Check service status</a> if the tool reports an error.</> },
];

export default function DocsQuickstart() {
  return <div className="docs-onboarding docs-agent-guide">
    <header className="docs-head">
      <span className="sec-eyebrow">Agent setup</span>
      <h1>Connect your AI agent.</h1>
      <p className="docs-lead">Add Rarebird as an MCP connection to use its news, research and market tools from your assistant. Follow these three steps.</p>
      <div className="docs-free-note"><Check size={14} aria-hidden="true" /> Free public access <span>·</span> No Rarebird account or API key</div>
    </header>

    <section className="docs-section" aria-labelledby="add-rarebird">
      <h2 id="add-rarebird"><span className="docs-step-number">1</span> Copy the connection URL</h2>
      <DocsMcpConnection />
    </section>

    <section className="docs-section" aria-labelledby="choose-assistant">
      <h2 id="choose-assistant"><span className="docs-step-number">2</span> Choose your assistant</h2>
      <p>Follow the instructions for the app you use.</p>
      <DocsAgentSetup />
    </section>

    <section className="docs-section" aria-labelledby="first-question">
      <h2 id="first-question"><span className="docs-step-number">3</span> Test it in a new conversation</h2>
      <p>Enable Rarebird in your chat, then send this question:</p>
      <div className="docs-first-question"><p>“{RAREBIRD_FIRST_QUESTION}”</p><CopyButton text={RAREBIRD_FIRST_QUESTION} label="Copy test question" /></div>
      <div className="docs-connection-success"><strong>You’re connected when you see:</strong><ul><li>A Rarebird tool call in your assistant</li><li>Headlines with source links and publication dates, or a clear report that no recent items are available</li></ul></div>
      <p className="docs-small">A saved connector alone does not confirm a lookup worked. <a href="/connect">Check the Rarebird service</a> if your client cannot reach it; that check cannot verify your assistant’s settings.</p>
    </section>

    <section className="docs-section" aria-labelledby="agent-instruction">
      <h2 id="agent-instruction">Make Rarebird part of your research</h2>
      <p>Try “What changed with NVIDIA?” or “What are the risks in Apple’s latest reporting?” For research questions, your assistant can choose the right Rarebird tool.</p>
      <details className="docs-disclosure"><summary>Optional: tell your assistant when to use Rarebird</summary><p>Add this to your assistant’s instructions, or send it in the chat.</p><AgentInstructions /></details>
      <p className="docs-small">For recurring briefings, set up a schedule in your assistant or workflow. Rarebird lookups do not create notifications or place trades.</p>
    </section>

    <section className="docs-section" aria-labelledby="setup-help">
      <h2 id="setup-help">Help with setup</h2>
      {HELP.map(item => <details className="docs-disclosure" key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}
      <a className="docs-text-action" href="mailto:contact@rarebird.network">Contact Rarebird <ArrowUpRight size={15} aria-hidden="true" /></a>
    </section>
  </div>;
}
