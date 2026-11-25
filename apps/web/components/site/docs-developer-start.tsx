"use client";

import { useId, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import CopyButton from "./copy-button";

import { RAREBIRD_API_URL } from "./connection-details";
const EXAMPLES = [
  {
    id: "curl", label: "cURL", language: "Bash", title: "Ask a research question",
    code: `curl --fail-with-body "https://www.rarebird.network/api/v2/research" \\
  -H "Content-Type: application/json" \\
  -d '{"question":"What changed with NVIDIA?"}'`,
  },
  {
    id: "javascript", label: "JavaScript", language: "JavaScript", title: "Ask a research question",
    code: `const response = await fetch(
  "https://www.rarebird.network/api/v2/research",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "What changed with NVIDIA?" })
  }
);
if (!response.ok) {
  throw new Error(\`Rarebird: HTTP \${response.status}\`);
}
const research = await response.json();
console.log(research);`,
  },
  {
    id: "catalog", label: "Find an asset", language: "Bash", title: "Search the supported catalog",
    code: `curl --fail-with-body --get "https://www.rarebird.network/api/v2/topics" \\
  --data-urlencode "q=bitcoin" \\
  --data-urlencode "limit=5"`,
  },
] as const;

export default function DocsDeveloperStart() {
  const [selected, setSelected] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const example = EXAMPLES[selected];

  return (
    <div className="docs-developer-start">
      <div className="docs-rest-base"><span>REST API base URL</span><code>{RAREBIRD_API_URL}</code></div>
      <div className="docs-example-tabs" role="tablist" aria-label="Integration example" onKeyDown={event => {
        let next = selected;
        if (event.key === "ArrowRight") next = (selected + 1) % EXAMPLES.length;
        else if (event.key === "ArrowLeft") next = (selected + EXAMPLES.length - 1) % EXAMPLES.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = EXAMPLES.length - 1;
        else return;
        event.preventDefault();
        setSelected(next);
        tabs.current[next]?.focus();
      }}>
        {EXAMPLES.map((item, index) => <button key={item.id} ref={node => { tabs.current[index] = node; }} type="button" role="tab" id={`${id}-${item.id}`} aria-selected={index === selected} aria-controls={`${id}-panel`} tabIndex={index === selected ? 0 : -1} onClick={() => setSelected(index)}>{item.label}</button>)}
      </div>
      <div className="docs-example-panel" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${example.id}`}>
        <div className="code-bar"><span>{example.title}</span><CopyButton key={example.id} text={example.code} label="Copy request" /></div>
        <pre key={example.id} tabIndex={0} aria-label={`${example.language} integration example`}><code>{example.code}</code></pre>
      </div>
      <div className="docs-example-next">
        <p>Research returns coverage, evidence and an answer when available. For raw headlines, find the asset first, then pass its returned <code>beat_id</code> to <code>/v2/news</code>.</p>
        <a href="#read-responses">Understand the response <ArrowRight size={16} aria-hidden="true" /></a>
      </div>
    </div>
  );
}
