"use client";

import { useId, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import CopyButton from "./copy-button";
import { RAREBIRD_MCP_CONFIG, RAREBIRD_MCP_URL } from "./connection-details";

const CLIENTS = ["Claude", "ChatGPT", "Cursor", "Codex", "Other"] as const;
const CODEX_COMMAND = `codex mcp add rarebird --url ${RAREBIRD_MCP_URL}`;

function SetupCode({ text, label }: { text: string; label: string }) {
  return <div className="code"><div className="code-bar"><span>{label}</span><CopyButton text={text} label="Copy configuration" /></div><pre><code>{text}</code></pre></div>;
}

export default function DocsAgentSetup() {
  const [selected, setSelected] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  return <div className="docs-client-setup">
    <div className="docs-client-tabs" role="tablist" aria-label="Choose your AI assistant" onKeyDown={event => {
      let next = selected;
      if (event.key === "ArrowRight") next = (selected + 1) % CLIENTS.length;
      else if (event.key === "ArrowLeft") next = (selected + CLIENTS.length - 1) % CLIENTS.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = CLIENTS.length - 1;
      else return;
      event.preventDefault();
      setSelected(next);
      tabs.current[next]?.focus();
    }}>
      {CLIENTS.map((client, index) => <button key={client} ref={node => { tabs.current[index] = node; }} type="button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel`} aria-selected={selected === index} tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)}>{client}</button>)}
    </div>
    <div className="docs-client-panel" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${selected}`} tabIndex={0}>
      {selected === 0 && <>
        <h3>Claude</h3>
        <ol className="docs-setup-list">
          <li>Open <strong>Customize → Connectors</strong>. Choose <strong>+ Add → Add custom connector</strong>.</li>
          <li>Name it <strong>Rarebird</strong> and paste the MCP server URL above. For authentication, choose <strong>No sign in</strong>.</li>
          <li>Finish adding the connector. In your chat, open <strong>+ → Connectors</strong> and enable Rarebird.</li>
        </ol>
        <p className="docs-small">In a Team or Enterprise workspace, an owner may need to add the connector first.</p>
        <a className="docs-source-link" href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp" target="_blank" rel="noopener noreferrer">Claude’s connector guide <ArrowUpRight size={14} aria-hidden="true" /></a>
      </>}
      {selected === 1 && <>
        <h3>ChatGPT on the web</h3>
        <p className="docs-small">Custom MCP availability depends on your plan and workspace permissions.</p>
        <ol className="docs-setup-list">
          <li>Open <strong>Plugins</strong>. Select <strong>+ → Add custom MCP server</strong>.</li>
          <li>Enter <strong>Rarebird</strong> as the name and paste the MCP server URL above. Choose <strong>No authentication</strong>.</li>
          <li>Review the connection and create the plugin. Install it, then type <strong>@</strong> in your chat and select Rarebird.</li>
        </ol>
        <p className="docs-small">If you cannot add a custom MCP server, check your workspace permissions or use another supported client.</p>
        <a className="docs-source-link" href="https://developers.openai.com/api/docs/guides/custom-mcp-server" target="_blank" rel="noopener noreferrer">ChatGPT’s MCP guide <ArrowUpRight size={14} aria-hidden="true" /></a>
      </>}
      {selected === 2 && <>
        <h3>Cursor editor</h3>
        <ol className="docs-setup-list">
          <li>Open or create <code>.cursor/mcp.json</code> in your project.</li>
          <li>Add the configuration below. If the file already has servers, add the <code>rarebird</code> entry inside its existing <code>mcpServers</code> object.</li>
          <li>Save the file. Open Cursor’s <strong>Customize</strong> page, enable Rarebird and use it in an Agent chat.</li>
        </ol>
        <SetupCode text={RAREBIRD_MCP_CONFIG} label=".cursor/mcp.json" />
        <a className="docs-source-link" href="https://cursor.com/docs/mcp" target="_blank" rel="noopener noreferrer">Cursor’s MCP guide <ArrowUpRight size={14} aria-hidden="true" /></a>
      </>}
      {selected === 3 && <>
        <h3>Codex CLI or IDE extension</h3>
        <ol className="docs-setup-list">
          <li>With the Codex CLI installed, run this command in your terminal.</li>
          <li>Run <code>codex mcp list</code> and check that <code>rarebird</code> is listed.</li>
          <li>Open a new Codex conversation and try the question below. The CLI and IDE extension share this configuration.</li>
        </ol>
        <div className="code"><div className="code-bar"><span>Add Rarebird to Codex</span><CopyButton text={CODEX_COMMAND} label="Copy command" /></div><pre><code>{CODEX_COMMAND}</code></pre></div>
        <details className="docs-disclosure"><summary>Use config.toml instead</summary><SetupCode text={`[mcp_servers.rarebird]\nurl = "${RAREBIRD_MCP_URL}"`} label="~/.codex/config.toml" /></details>
        <a className="docs-source-link" href="https://developers.openai.com/learn/docs-mcp" target="_blank" rel="noopener noreferrer">Codex’s MCP setup guide <ArrowUpRight size={14} aria-hidden="true" /></a>
      </>}
      {selected === 4 && <>
        <h3>Another MCP client</h3>
        <ol className="docs-setup-list">
          <li>Find your client’s option to add a <strong>remote MCP server</strong>.</li>
          <li>Name it <strong>Rarebird</strong>, paste the URL above and select <strong>Streamable HTTP</strong> if asked for a transport. Public access uses <strong>no authentication</strong>.</li>
          <li>Save, enable the tools and start a conversation.</li>
        </ol>
        <p className="docs-small">Configuration formats vary. A URL pasted into an ordinary chat message does not create a connection.</p>
        <a className="docs-source-link" href="/docs/connect#mcp">Technical connection details <ArrowUpRight size={14} aria-hidden="true" /></a>
      </>}
    </div>
  </div>;
}
