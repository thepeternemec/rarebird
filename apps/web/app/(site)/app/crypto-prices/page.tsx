import WorkspaceShell from "@/components/site/workspace-shell";
import CryptoMarketBoard from "@/components/site/crypto-market-board";

export const metadata = {
  title: "Crypto prices | Rarebird",
  description: "Browse crypto prices, moves and trading volume.",
  alternates: { canonical: "/app/crypto-prices" },
};

export default function CryptoPricesPage() {
  return <WorkspaceShell active="/app/crypto-prices" title="Crypto prices"><CryptoMarketBoard /></WorkspaceShell>;
}
