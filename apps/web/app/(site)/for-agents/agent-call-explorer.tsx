"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, CircleDot, FileText, Play, ScanLine, Terminal } from "lucide-react";
import type { CatalystRadar, DiscoveryFeed, PricesPayload, Sourced, StockScreenerFeed } from "@rarebird/contracts";
import CopyButton from "@/components/site/copy-button";

const examples = [
  {
    id: "setups",
    title: "Stock setups",
    scope: "Current screener results",
    icon: ScanLine,
    tool: "rarebird_stock_screener",
    args: { limit: 3 },
    path: "/api/v2/stock-screener?limit=3",
    fields: [["status", "Whether the screener can check for setups"], ["source", "Feed coverage and last scan time"], ["active", "Current setups, with a reason and expiry"]],
    excerpt(data: unknown) {
      const { status, message, source, active } = data as StockScreenerFeed;
      return { status, message, source, active: active.slice(0, 2).map(({ symbol, state, reason, valid_until }) => ({
        symbol, state, reason, valid_until,
      })) };
    },
  },
  {
    id: "news",
    title: "News signals",
    scope: "Latest stock developments",
    icon: Terminal,
    tool: "rarebird_discovery",
    args: { asset: "equity", limit: 3 },
    path: "/api/v2/discovery?asset=equity&limit=3",
    fields: [["events", "Developments and affected tickers"], ["evidence", "Original source links and publication times"], ["coverage", "What was checked and when"]],
    excerpt(data: unknown) {
      const { status, coverage, events } = data as DiscoveryFeed;
      return { status, coverage, events: events.slice(0, 2).map(({ title, assets, first_recorded_at, evidence, next_check }) => ({
        title, assets, first_recorded_at, evidence: evidence.slice(0, 1), next_check,
      })) };
    },
  },
  {
    id: "filings",
    title: "SEC filings",
    scope: "NVIDIA disclosures",
    icon: FileText,
    tool: "rarebird_catalysts",
    args: { beat_id: "b_bb964843350e", limit: 3 },
    path: "/api/v2/catalysts?beat_id=b_bb964843350e&limit=3",
    fields: [["items", "Recent qualifying SEC disclosures"], ["coverage", "Issuer and last source check"], ["snapshot", "Filed documents and reported comparisons"]],
    excerpt(data: unknown) {
      const { status, items, coverage } = data as CatalystRadar;
      return { status, items: items.slice(0, 2), coverage: coverage.map(({ label, status, checked_at, snapshot }) => ({
        label, status, checked_at, snapshot: snapshot ? { filings: snapshot.filings.slice(0, 1), comparisons: snapshot.comparisons.slice(0, 1) } : null,
      })) };
    },
  },
  {
    id: "prices",
    title: "Crypto prices",
    scope: "Bitcoin and Ethereum",
    icon: CircleDot,
    tool: "rarebird_prices",
    args: { ids: ["bitcoin", "ethereum"] },
    path: "/api/v2/prices?ids=bitcoin,ethereum",
    fields: [["data.assets", "USD prices, 24-hour changes and volume"], ["observed_at", "Time of each price observation"], ["freshness", "Age and source status"]],
    excerpt(data: unknown) {
      const { source, source_url, fetched_at, freshness, data: prices } = data as Sourced<PricesPayload>;
      return { source, source_url, fetched_at, freshness, data: { assets: prices.assets.slice(0, 2), unsupported: prices.unsupported } };
    },
  },
] as const;

type Example = (typeof examples)[number];
type Transport = "MCP" | "REST";
type Preview = { status: "loading" | "error" } | { status: "ready"; body: string; code: number };

function ExampleCall({ example, transport, origin }: { example: Example; transport: Transport; origin: string }) {
  const [preview, setPreview] = useState<Preview>();
  const active = useRef<AbortController>(null);
  const url = origin + example.path;
  const request = transport === "MCP"
    ? JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: example.tool, arguments: example.args } }, null, 2)
    : "curl -fsS '" + url + "'";

  useEffect(() => () => active.current?.abort(), []);

  async function run() {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setPreview({ status: "loading" });
    const timer = window.setTimeout(() => controller.abort("timeout"), 12_000);
    try {
      const response = await fetch(example.path, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error("Request unavailable");
      const data = await response.json();
      if (!controller.signal.aborted && active.current === controller) {
        setPreview({ status: "ready", body: JSON.stringify(example.excerpt(data), null, 2), code: response.status });
      }
    } catch {
      if (active.current === controller && (!controller.signal.aborted || controller.signal.reason === "timeout")) setPreview({ status: "error" });
    } finally {
      window.clearTimeout(timer);
    }
  }

  return <div className="rb-agent-trace">
    <section className="rb-agent-pane" aria-label={transport + " request"}>
      <div className="rb-agent-pane-head">
        <span>{transport === "MCP" ? "Tool call" : "HTTP request"}</span>
        <CopyButton key={transport} text={request} label="Copy request" />
      </div>
      <pre className="rb-agent-code" data-lenis-prevent tabIndex={0} aria-label={transport + " request code"}><code>{request}</code></pre>
      <div className="rb-agent-run-row">
        <button className="rb-agent-run" type="button" onClick={() => void run()} disabled={preview?.status === "loading"}>
          <Play size={14} aria-hidden="true" /> Run REST sample
        </button>
      </div>
    </section>
    <section className="rb-agent-pane rb-agent-output" aria-label="Response preview">
      <div className="rb-agent-pane-head">
        <span aria-live="polite">{preview?.status === "ready" ? "Live response excerpt" : "Response fields"}</span>
        {preview?.status === "ready" && <span className="rb-agent-http">HTTP {preview.code}</span>}
      </div>
      {preview?.status === "ready" ? <pre className="rb-agent-code" data-lenis-prevent tabIndex={0} aria-label="Live response JSON"><code>{preview.body}</code></pre>
        : <dl className="rb-agent-fields">{example.fields.map(([field, description]) => <div key={field}><dt>{field}</dt><dd>{description}</dd></div>)}</dl>}
      <div className="rb-agent-run-row">
        <span role="status">{preview?.status === "loading" ? "Reading Rarebird…" : preview?.status === "error" ? "The sample is unavailable. Try again." : ""}</span>
        <a href={url} target="_blank" rel="noreferrer">Open raw JSON <ArrowUpRight size={14} aria-hidden="true" /></a>
      </div>
    </section>
  </div>;
}

export default function AgentCallExplorer({ origin }: { origin: string }) {
  const [example, setExample] = useState<Example>(examples[0]);
  const [transport, setTransport] = useState<Transport>("MCP");
  return <section className="rb-agent-section rb-agent-explorer" id="tool-explorer" aria-labelledby="agent-explorer-title">
    <div className="rb-agent-section-head">
      <h2 id="agent-explorer-title">Explore a tool call</h2>
      <span className="rb-agent-caption">Public reads · No API key</span>
    </div>
    <div className="rb-agent-console">
      <div className="rb-agent-examples" role="group" aria-label="Example dataset">
        {examples.map(option => {
          const Icon = option.icon;
          return <button type="button" key={option.id} aria-pressed={option.id === example.id} onClick={() => setExample(option)}>
            <Icon size={16} aria-hidden="true" />
            <span><strong>{option.title}</strong><small>{option.scope}</small></span>
            <ArrowRight className="rb-agent-example-arrow" size={14} aria-hidden="true" />
          </button>;
        })}
      </div>
      <div className="rb-agent-console-main">
        <div className="rb-agent-console-head">
          <strong>{example.scope}</strong>
          <div className="rb-agent-transport" role="group" aria-label="Request format">
            {(["MCP", "REST"] as const).map(value => <button type="button" key={value} aria-pressed={value === transport} onClick={() => setTransport(value)}>{value}</button>)}
          </div>
        </div>
        <ExampleCall key={example.id} example={example} transport={transport} origin={origin} />
      </div>
    </div>
  </section>;
}
