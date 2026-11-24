import { notFound, permanentRedirect } from "next/navigation";
import { coinIdPattern, workspaceCoinHref } from "@/lib/workspace-links";

export default async function CoinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!coinIdPattern.test(id)) notFound();
  permanentRedirect(workspaceCoinHref(id));
}
