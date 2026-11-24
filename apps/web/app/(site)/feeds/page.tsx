import { permanentRedirect } from "next/navigation";
import { legacyMarketDestination } from "@/lib/legacy-market-link";

export default async function FeedsPage({ searchParams }: {
  searchParams: Promise<{ beat?: string; market?: string }>;
}) {
  const { beat, market } = await searchParams;
  permanentRedirect(legacyMarketDestination(beat, market));
}
