import { timingSafeEqual } from "node:crypto";
import { publishStockPredictions } from "@rarebird/api";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (Number(request.headers.get("content-length")) > 300000) return Response.json({ error: "body_too_large" }, { status: 413 });
  try {
    const body = await request.text();
    if (body.length > 300000) return Response.json({ error: "body_too_large" }, { status: 413 });
    return Response.json(await publishStockPredictions(JSON.parse(body)), { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "prediction_batch_rejected" }, { status: 400 }); }
}
