import { permanentRedirect } from "next/navigation";
import { legacyMarketDestination } from "@/lib/legacy-market-link";

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  permanentRedirect(legacyMarketDestination(searchParams.get("beat"), searchParams.get("market")));
}
