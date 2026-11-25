import { timingSafeEqual } from "node:crypto";
import { runStockScreener } from "@rarebird/api";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "stock_screener_not_configured" }, { status: 503 });
  const actual = Buffer.from(request.headers.get("authorization") ?? ""), expected = Buffer.from("Bearer " + secret);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return Response.json({ ok: true, ...(await runStockScreener()) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("stock screener run unavailable");
    return Response.json({ error: "stock_screener_unavailable" }, { status: 503 });
  }
}
