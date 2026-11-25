"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

/** Copies the displayed URL or code and confirms whether the clipboard accepted it. */
export default function CopyButton({ text, label = "Copy", copiedLabel = "Copied", className = "copy-btn" }: {
  text: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [feedback, setFeedback] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (feedback === "idle") return;
    const timeout = window.setTimeout(() => setFeedback("idle"), 2500);
    return () => window.clearTimeout(timeout);
  }, [feedback, text]);

  return (
    <button
      type="button"
      className={className}
      aria-label={/^copy\b/i.test(label) ? label : `Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setFeedback("copied");
        } catch {
          setFeedback("failed");
        }
      }}
    >
      {feedback === "copied" ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
      <span role="status">{feedback === "copied" ? copiedLabel : feedback === "failed" ? "Select text to copy" : label}</span>
    </button>
  );
}
