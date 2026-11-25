import { timingSafeEqual } from "node:crypto";
import { runKumoFeedCollection } from "@rarebird/api";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: "kumo_feeds_not_configured" }, { status: 503 });
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from("Bearer " + secret);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return Response.json({ ok: true, ...(await runKumoFeedCollection()) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Kumo feed collection unavailable", error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "kumo_feeds_unavailable" }, { status: 503 });
  }
}
