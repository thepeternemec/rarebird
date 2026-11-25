"use client";

import { useEffect, useState } from "react";
import { STOCK_PILOT_ENDPOINT, summarizeStockPilot } from "./stock-pilot-snapshot";

export default function StockPilotReadiness() {
  const [status, setStatus] = useState("Checking stock-feed status");
  useEffect(() => {
    let mounted = true;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
    void fetch(STOCK_PILOT_ENDPOINT, { signal: controller.signal, cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(feed => { if (mounted) setStatus(summarizeStockPilot(feed).title); })
      .catch(() => { if (mounted) setStatus("Stock-feed status unavailable"); })
      .finally(() => clearTimeout(timer));
    return () => { mounted = false; controller.abort(); clearTimeout(timer); };
  }, []);
  return <p className="rb-home-readiness" role="status"><span />{status}<a href="/app/screener">Check readiness</a></p>;
}
