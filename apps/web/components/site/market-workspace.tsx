"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import { PRIORITY_BEAT_IDS, type CryptoMarketRow } from "@rarebird/contracts";
import type { workspaceSelection } from "@/lib/workspace-selection";
import { forecastTickerFor, workspaceAssetHref, workspaceCoinHref, workspaceMarketHref, type WorkspaceMarket } from "@/lib/workspace-links";
import AssetReporting from "./asset-reporting";
import CatalogSearch from "./catalog-search";
import { API_BASE } from "./content";
import CryptoMarketBoard, { CryptoCoinHeading, CryptoPricePanels, useCryptoMarkets } from "./crypto-market-board";
import CryptoOverview from "./crypto-overview";
import DeferredDetails from "./deferred-details";
import TickerBrief from "./investment-lookup";
import { findAssets, matchesCatalogCoin, type LookupAsset } from "./landing-lookup-data";
import MarketBriefingCard, { ForecastWorkspace } from "./market-briefing";
import MarketDiscovery from "./market-discovery";
import OpportunityBrief from "./opportunity-brief";
import SignalInspector from "./signal-inspector";
import { SignalPrice, useSignalPrices } from "./signal-prices";
import "./market-workspace.css";

type Selection = ReturnType<typeof workspaceSelection>;
type CryptoMarket = ReturnType<typeof useCryptoMarkets>;

const markets = [
  { id: "equity", label: "Stocks" },
  { id: "crypto", label: "Crypto" },
] as const;

function StockPrices({ stocks, overview = false }: { stocks: LookupAsset[]; overview?: boolean }) {
  const prices = useSignalPrices(stocks);
  return <section id="prices" className="rb-workspace-stocks" aria-label={overview ? "Stock prices" : "Stock price"}>
    <h2>{overview ? "Stock prices" : "Price"}</h2>
    <div className="rb-stock-prices" data-overview={overview}>
      {stocks.map(stock => <div className="rb-stock-price" key={stock.beat_id}>
        {overview && <Link href={workspaceAssetHref(stock.beat_id)}>
          <span><strong>{stock.ticker}</strong><small>{stock.label}</small></span>
          <ArrowRight size={16} aria-hidden="true" />
        </Link>}
        <SignalPrice asset={stock} prices={prices} />
      </div>)}
    </div>
  </section>;
}

function MarketDashboard({ market, stocks, crypto }: { market: WorkspaceMarket; stocks: LookupAsset[]; crypto: CryptoMarket }) {
  const isCrypto = market === "crypto";
  return <div className="rb-workspace-flow">
    <header className="rb-workspace-heading">
      <h1>{isCrypto ? "Crypto markets" : "Stock markets"}</h1>
      <a className="rb-workspace-action" href="#news">Latest signals <ArrowDown size={14} aria-hidden="true" /></a>
    </header>
    {isCrypto ? <section id="prices" aria-label="Crypto prices"><CryptoMarketBoard market={crypto} /></section>
      : <StockPrices stocks={stocks} overview />}
    <MarketDiscovery market={market} id="news" />
    <div className="rb-workspace-details">
      <DeferredDetails id="opportunities" title={isCrypto ? "Review candidates" : "Reviews and filings"}>
        <OpportunityBrief market={market} />
      </DeferredDetails>
      {isCrypto && <>
        <DeferredDetails id="indicators" title="Crypto market indicators">
          <div className="crypto-overview">
            <CryptoOverview />
            <MarketBriefingCard showForecasts={false} />
          </div>
        </DeferredDetails>
        <DeferredDetails id="forecasts" title="BTC and ETH hourly forecasts">
          <ForecastWorkspace />
        </DeferredDetails>
      </>}
    </div>
  </div>;
}

function AssetWorkspace({ asset, coin, crypto, identityNotice }: {
  asset?: LookupAsset;
  coin?: CryptoMarketRow;
  crypto: CryptoMarket;
  identityNotice?: string;
}) {
  const market = asset?.asset === "equity" ? "equity" : "crypto";
  const beatId = asset?.beat_id;
  const isPilot = PRIORITY_BEAT_IDS.some(id => id === beatId);
  const forecast = beatId ? forecastTickerFor(beatId) : undefined;
  return <article className="rb-workspace-flow rb-asset-workspace">
    <header>
      <Link className="rb-workspace-back" href={workspaceMarketHref(market)}>
        <ArrowLeft size={16} aria-hidden="true" /> {market === "equity" ? "All stocks" : "All crypto"}
      </Link>
      {coin ? <CryptoCoinHeading coin={coin} /> : asset && <div className="rb-workspace-heading rb-asset-heading">
        <h1>{asset.label}</h1><span>{asset.ticker}</span>
      </div>}
    </header>

    {market === "equity" && asset ? <StockPrices stocks={[asset]} />
      : <section id="prices" aria-label="Crypto price">
        {coin && crypto.snapshot ? <CryptoPricePanels coin={coin} snapshot={crypto.snapshot} now={crypto.now} />
          : <p className="rb-workspace-meta" role="status">{crypto.loading && !crypto.snapshot
            ? "Checking the crypto quote…" : "No matching quote in the latest market snapshot."}</p>}
      </section>}

    {asset ? <>
      <div className="rb-asset-report-grid">
        <AssetReporting asset={asset} />
        <MarketDiscovery market={market} beatId={asset.beat_id} id="signals" />
      </div>
      <div className="rb-workspace-details">
        {(isPilot || market === "equity") && <DeferredDetails id="opportunities" title={market === "equity" ? "Reviews and filings" : "Review candidates"}>
          {isPilot ? <OpportunityBrief market={market} beatId={asset.beat_id} />
            : <p className="rb-workspace-meta">Rarebird does not yet track official filings or review checks for {asset.label}.</p>}
        </DeferredDetails>}
        {isPilot && <DeferredDetails id="evidence" title="Market evidence">
          <SignalInspector beatId={asset.beat_id} />
        </DeferredDetails>}
        {forecast && <DeferredDetails id="forecasts" title={forecast + " hourly forecast"}>
          <ForecastWorkspace ticker={forecast} />
        </DeferredDetails>}
        <DeferredDetails id="brief" title="Ticker research">
          <TickerBrief asset={asset} />
        </DeferredDetails>
      </div>
    </> : <section id="news" className="rb-asset-reporting">
      <h2>Latest news</h2>
      <p className="rb-workspace-meta" role="status">{identityNotice}</p>
    </section>}
  </article>;
}

function CoinWorkspace({ id, crypto }: { id: string; crypto: CryptoMarket }) {
  const coin = crypto.snapshot?.data.assets.find(row => row.id === id);
  const name = coin?.name;
  const symbol = coin?.symbol;
  const identity = JSON.stringify([id, name, symbol]);
  const [match, setMatch] = useState<{ identity: string; asset?: LookupAsset; failed: boolean }>();
  const resolution = match?.identity === identity ? match : undefined;
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!name || !symbol) return;
    const request = new AbortController();
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(8000)]);
    void findAssets(API_BASE, symbol, signal)
      .then(topics => {
        const matches = topics.filter(topic => matchesCatalogCoin(topic, { id, name, symbol }));
        if (!request.signal.aborted) setMatch({ identity, asset: matches.length === 1 ? matches[0] : undefined, failed: false });
      })
      .catch(() => { if (!request.signal.aborted) setMatch({ identity, failed: true }); });
    return () => request.abort();
  }, [id, name, symbol, identity, revision]);

  if (!coin) return <section className="rb-workspace-flow">
    <Link className="rb-workspace-back" href={workspaceMarketHref("crypto")}><ArrowLeft size={16} aria-hidden="true" /> All crypto</Link>
    <h1>Coin markets</h1>
    <p className="rb-workspace-meta" role="status">{crypto.loading ? "Checking the market snapshot…"
      : crypto.failed ? "Market prices are temporarily unavailable." : "This coin is outside the current market snapshot."}</p>
    {crypto.failed && <button type="button" className="rb-workspace-action" onClick={crypto.refresh}>Try again</button>}
  </section>;

  return <>
    <AssetWorkspace key={resolution?.asset?.beat_id ?? id} asset={resolution?.asset} coin={coin} crypto={crypto}
      identityNotice={!resolution ? "Matching this coin to Rarebird’s news catalog…"
        : resolution.failed ? "The news catalog could not be checked." : "No news catalog entry matched this coin’s name and ticker."} />
    {resolution?.failed && <button type="button" className="rb-workspace-action" onClick={() => { setMatch(undefined); setRevision(value => value + 1); }}>Retry news lookup</button>}
  </>;
}

export default function MarketWorkspace({ selection, featuredStocks }: { selection: Selection; featuredStocks: LookupAsset[] }) {
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();
  const { asset, coinId, market, query, unavailable } = selection;
  const crypto = useCryptoMarkets(market === "crypto");
  const coins = crypto.snapshot?.data.assets ?? [];
  const matches = asset?.asset === "crypto" ? coins.filter(coin => matchesCatalogCoin(asset, coin)) : [];
  const selectedCoin = matches.length === 1 ? matches[0] : undefined;

  function open(href: string) {
    window.scrollTo({ top: 0, behavior: "instant" });
    startTransition(() => router.push(href));
  }

  return <div className="rb-market-workspace">
    <div className="rb-market-toolbar">
      <CatalogSearch key={query} id={id} initialQuery={query}
        onSelect={topic => open(workspaceAssetHref(topic.beat_id))}
        marketCoins={market === "crypto" ? { coins, onSelect: coin => open(workspaceCoinHref(coin)) } : undefined} />
      <nav className="rb-market-switch" aria-label="Market">
        {markets.map(tab => <Link key={tab.id} href={workspaceMarketHref(tab.id)}
          aria-current={market === tab.id ? "page" : undefined}>{tab.label}</Link>)}
      </nav>
    </div>
    {pending && <p className="rb-workspace-meta" role="status">Opening selection…</p>}
    {unavailable && <p className="rb-workspace-meta" role="status">That asset isn’t available. Use ticker search to find it.</p>}
    {asset ? <AssetWorkspace key={asset.beat_id} asset={asset} coin={selectedCoin} crypto={crypto} />
      : coinId ? <CoinWorkspace key={coinId} id={coinId} crypto={crypto} />
        : <MarketDashboard key={market} market={market} stocks={featuredStocks} crypto={crypto} />}
  </div>;
}
