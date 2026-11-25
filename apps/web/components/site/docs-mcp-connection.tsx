import CopyButton from "./copy-button";
import { RAREBIRD_MCP_URL } from "./connection-details";

export default function DocsMcpConnection() {
  return <div className="docs-mcp-card">
    <div className="docs-mcp-card-heading"><span>MCP server URL</span><CopyButton text={RAREBIRD_MCP_URL} label="Copy connection URL" copiedLabel="URL copied" /></div>
    <code className="docs-mcp-url">{RAREBIRD_MCP_URL}</code>
    <dl className="docs-mcp-fields">
      <div><dt>Name</dt><dd>Rarebird</dd></div>
      <div><dt>Transport</dt><dd>Streamable HTTP</dd></div>
      <div><dt>Authentication</dt><dd>None</dd></div>
    </dl>
    <p className="docs-mcp-caption">One connection includes all Rarebird tools. No Rarebird account or API key needed for public access.</p>
  </div>;
}
