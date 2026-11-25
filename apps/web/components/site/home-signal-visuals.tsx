import type { CSSProperties } from "react";
import { Bell, Check, Clock3, FileText, ScanLine } from "lucide-react";
import FooterSignalMark from "./footer-signal-mark";

const SCREENING_CHECKS = [
  { label: "Relative strength", result: "Above market", cells: "00100112123344" },
  { label: "Trading volume", result: "Above baseline", cells: "01001111234444" },
  { label: "Bid–ask spread", result: "Within limit", cells: "11101122223344" },
];

const ALERT_DETAILS = [
  { icon: ScanLine, label: "Why it qualified", text: "Screening measurements and their reference values", cells: "11223444" },
  { icon: FileText, label: "Relevant reporting", text: "Original source links and publication times, when available", cells: "01223344" },
  { icon: Clock3, label: "When it’s valid", text: "Detection time, data freshness and expiry", cells: "00122344" },
];

function SignalTiles({ cells }: { cells: string }) {
  return (
    <span className="rb-home-tiles" aria-hidden="true" style={{ "--tile-count": cells.length } as CSSProperties}>
      {Array.from(cells, (level, index) => (
        <i key={index} data-level={level} style={{ "--tile-delay": `${index * 46}ms` } as CSSProperties} />
      ))}
    </span>
  );
}

export function ScreeningPreview() {
  return (
    <aside className="rb-home-preview rb-home-panel" aria-labelledby="home-preview-label">
      <div className="rb-home-preview-art"><FooterSignalMark /></div>
      <header className="rb-home-preview-heading">
        <div><span className="rb-home-example-label" id="home-preview-label">Illustrative stock alert</span><strong>NVDA <span>·</span> Setup detected</strong></div>
        <span className="rb-home-alert-icon"><Bell size={18} aria-hidden="true" /></span>
      </header>
      <dl className="rb-home-preview-checks">
        {SCREENING_CHECKS.map(({ label, result, cells }) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd><SignalTiles cells={cells} /><span><Check size={13} aria-hidden="true" />{result}</span></dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

export function AlertDetails() {
  return (
    <article className="rb-home-panel rb-home-story">
      <h3>See why it qualified.</h3>
      <p>Give your agent enough evidence to investigate the move and verify the underlying data.</p>
      <ul className="rb-home-evidence">
        {ALERT_DETAILS.map(({ icon: Icon, label, text, cells }) => (
          <li key={label}>
            <span className="rb-home-evidence-icon"><Icon size={17} aria-hidden="true" /></span>
            <div><strong>{label}</strong><p>{text}</p></div>
            <SignalTiles cells={cells} />
          </li>
        ))}
      </ul>
    </article>
  );
}

export function SetupTimeline() {
  return (
    <article className="rb-home-panel rb-home-story rb-home-timeline">
      <h3>See what happened next.</h3>
      <p>Rarebird keeps the same setup ID as conditions change and records what the price did after detection.</p>
      <ol className="rb-home-checkpoints">
        <li><span>Detection</span><strong>Setup qualifies</strong></li>
        <li><span>15 minutes later</span><strong>First observation</strong></li>
        <li><span>60 minutes later</span><strong>Second observation</strong></li>
      </ol>
      <SignalTiles cells="432122224321111143222211" />
      <p className="rb-home-timeline-note">Your agent can also see if a setup is held for missing data, invalidated or expired.</p>
    </article>
  );
}

export function AgentDelivery() {
  return (
    <div className="rb-home-panel rb-home-delivery">
      <div className="rb-home-delivery-brand"><FooterSignalMark /></div>
      <dl>
        <div><dt>MCP</dt><dd><SignalTiles cells="12344321" /><span>Your agent asks for setups and updates</span></dd></div>
        <div><dt>Webhook</dt><dd><SignalTiles cells="01123344" /><span>Rarebird pushes alerts to your configured endpoint</span></dd></div>
      </dl>
    </div>
  );
}
