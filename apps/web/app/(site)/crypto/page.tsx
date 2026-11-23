import WorkspaceShell from "@/components/site/workspace-shell";
import MarketBriefingCard from "@/components/site/market-briefing";
import CryptoOverview from "@/components/site/crypto-overview";
import MarketDiscovery from "@/components/site/market-discovery";
import DeferredDetails from "@/components/site/deferred-details";
import "./crypto.css";

export const metadata = {
  title: "Crypto news and indicators | Rarebird",
  description: "Follow crypto news and prices, then open funding, DEX activity, sentiment and breadth when needed.",
  alternates: { canonical: "/crypto" },
};

export default function CryptoPage() {
  return <WorkspaceShell active="/crypto">
    <div className="rb-news-home">
      <MarketDiscovery initialMarket="crypto" showControls={false} />
      <DeferredDetails id="indicators" title="Funding, volume, sentiment and market breadth">
        <div className="crypto-overview">
          <MarketBriefingCard showForecasts={false} />
          <CryptoOverview />
          <a href="/app/forecasts">See hourly BTC and ETH forecast results</a>
        </div>
      </DeferredDetails>
    </div>
  </WorkspaceShell>;
}
