"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export default function DeferredDetails({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  const details = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    function openAnchor() {
      if (window.location.hash !== "#" + id || !details.current) return;
      details.current.open = true;
      details.current.scrollIntoView({ block: "nearest" });
    }
    openAnchor();
    window.addEventListener("hashchange", openAnchor);
    return () => window.removeEventListener("hashchange", openAnchor);
  }, [id]);

  return <details className="rb-app-evidence" ref={details} id={id} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{title}<ChevronDown size={16} aria-hidden="true" /></summary>
    {open && <div>{children}</div>}
  </details>;
}
