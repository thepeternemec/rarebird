<p align="center">
  <a href="https://www.rarebird.network/">
    <img src="brand/rarebird-github.svg" width="100%" alt="Rarebird — Find what changed. Know what to check next.">
  </a>
</p>

# Your agent's eyes on the stock market

Rarebird screens for developing stock setups, records the evidence and expiry, and gives connected agents a lifecycle they can follow. Every setup keeps its original measurements and forward outcomes. The app shows which data and delivery services are actually connected.

**[Open the app ↗](https://www.rarebird.network/app)** &nbsp;·&nbsp; **[Connect your agent ↗](https://www.rarebird.network/for-agents)**

**Free through December 31, 2026.** Both are included in the planned Rarebird Pro membership at **$8.99 USD/month**. [See pricing](https://www.rarebird.network/pricing).

## S&P 500 stock setups for agents

The [stock screener](https://www.rarebird.network/app/screener) covers an observed **S&P 500 snapshot of 503 securities versus SPY**. It flags developing relative strength with unusual volume, records one setup per episode, follows holds/invalidation/expiry, and freezes 15/60-minute forward observations. Optional signed webhooks deliver lifecycle changes to an operator-configured agent.

Read it through the existing MCP connection with `rarebird_stock_screener`, or `GET /api/v2/stock-screener`. This screen uses a dedicated US-share feed; tokenized share prices are not substituted. **Feed connection and notification delivery must be configured before live operation.** Every response states coverage and readiness. [Feed, worker and agent setup](docs/STOCK-SCREENER.md).

A separate Kumo Engine worker estimates a positive 15-minute beta-adjusted relative move after the stated cost scenario, conditional on a detected setup. It freezes each prospective prediction and compares its forward Brier score with a training-only base rate on the same observations. Immediate detection does not wait for fitting or a generated explanation. Training and live-worker status are visible separately from the performance record.

[Activate the service](docs/STOCK-OPERATIONS.md) · [Deploy the persistent CPU worker](deploy/stock-kumo.compose.yml) · `npm run stocks:doctor` for a read-only activation check. CI builds the deployment image, fits actual Kumo on isolated synthetic rows and verifies the lifecycle and prediction journal against disposable PostgreSQL. These checks do not establish live profitability or predictive advantage.

## NVIDIA Kumo Engine integration

**Kumo Engine is an accelerator for context generation over structured data.** It stores related tables as a graph on disk and assembles connected records as context for predictive models. [Explore NVIDIA Kumo Engine](https://github.com/NVIDIA/kumo-engine).

The S&P 500 model uses frozen screening measurements and publisher/age relationships for reporting already attached at detection. It requires at least 120 observed setups across six UTC trading dates and time-separated fitting partitions. [Stock target, evaluation and runtime](docs/STOCK-SCREENER.md#stock-kumo-target-runtime-and-evaluation).

### Separate BTC feed-graph experiment

Rarebird has integrated Kumo Engine with a shared feed graph for experimental BTC predictions. Fourteen feed types cover headlines, interpreted news events, discoveries, SEC filings and reported financials, crypto and tokenized-equity market observations, funding, liquidity, sentiment and chain readings. Each record keeps its source, entity identity and first availability. Headline and interpretation text contributes explicit word-vector features.

The hourly job compares the expanded graph with the original market-and-news-metadata model on the same next-hour 1% move target. It reports Brier score, log loss, calibration and per-feed coverage, with a separate prospective prediction journal. Newly journaled feeds accumulate history from first capture; gaps and sampling caps remain visible.

**BTC was the first measured pilot.** The stock model has its own target, forward cohort and runtime. We are building this approach across asset classes and data types, keeping each model's source coverage and measured outcomes explicit.

[BTC experiment and methodology](docs/BTC-KUMO.md) · [Measurement runs](https://github.com/thepeternemec/rarebird/actions/workflows/btc-kumo.yml) · [Integration code](scripts/kumo-btc)

## What you can do today

| | What Rarebird gives you |
| --- | --- |
| **Find what moved** | Follow market developments across 2,030 stock and crypto topics. Open the original source and see when it was published and recorded. [News signals](https://www.rarebird.network/app) |
| **Investigate the risk** | Look up a ticker and get a brief with supporting evidence, downside risks and what to check next. A six-asset pilot measures unusual moves, volume and liquidity. [Ticker research](https://www.rarebird.network/ask) |
| **Check the track record** | Inspect experimental hourly BTC and ETH forecasts and compare their outcomes with a historical baseline. [Forecast scorecard](https://www.rarebird.network/app/forecasts) |

**In development:** portfolio-aware risk monitoring and position sizing using your loss budget, liquidity and existing exposure. Today’s research shows the timestamps, uncertainties and coverage behind each result.

## Use the app or connect an agent

**In the app:** [Open the workspace](https://www.rarebird.network/app). Switch between stocks and crypto, research a ticker, or explore crypto prices and your watchlist.

**In your assistant:** Add Rarebird as a remote MCP server using Streamable HTTP. A compatible client can discover tools such as `rarebird_discovery` and `rarebird_research`.

```text
https://www.rarebird.network/api/mcp
```

Try asking: *What changed with NVIDIA? Which sources support it, and what should I watch next?*

**With REST:** Look up an asset or ask a research question directly.

```bash
curl 'https://www.rarebird.network/api/v2/topics?q=nvidia&limit=5'

curl -X POST 'https://www.rarebird.network/api/v2/research' \
  -H 'Content-Type: application/json' \
  -d '{"question":"What could change the outlook for NVIDIA?"}'
```

[Connection guide](https://www.rarebird.network/docs/quickstart) · [API and MCP reference](AGENTS.md) · [Examples](examples/README.md) · [Service status](https://www.rarebird.network/status)

## Read the evidence

Rarebird records when it first sees a development and links the reporting behind it. Where market measurements exist, it checks for confirmation and flags stale or missing inputs. A review can identify reasons to wait or specify what would invalidate a view.

Catalog news collection runs on a ten-minute schedule. Priority assets support fifteen-minute sessions of one-minute news collection on request. Market checks and forecasts use separate schedules and report their own freshness.

[Research coverage](docs/RESEARCH.md) · [Market and forecast methodology](docs/QUANTITATIVE.md) · [Current capabilities](docs/STATUS.md)

## Built in the open

| What shipped | Implementation |
| --- | --- |
| Source-linked ticker research and Telegram briefs | [#121](https://github.com/thepeternemec/rarebird/pull/121) |
| Catalog-wide market discovery with source and observation times | [#131](https://github.com/thepeternemec/rarebird/pull/131) |
| Token identity and pool evidence by chain and contract | [#125](https://github.com/thepeternemec/rarebird/pull/125) |
| NVIDIA Kumo Engine integration and BTC model measurements | [#162](https://github.com/thepeternemec/rarebird/pull/162) · [#163](https://github.com/thepeternemec/rarebird/pull/163) |
| Hourly BTC and ETH forecasts and forward evaluation | [#130](https://github.com/thepeternemec/rarebird/pull/130) |
| Direct filing evidence for four pilot issuers | [#119](https://github.com/thepeternemec/rarebird/pull/119) |

[Changelog](CHANGELOG.md) · [Commit history](https://github.com/thepeternemec/rarebird/commits/main/) · [Build checks](https://github.com/thepeternemec/rarebird/actions)

## Develop locally

Use Node.js 22 or 24 with npm.

```bash
git clone https://github.com/thepeternemec/rarebird.git
cd rarebird
npm ci
npm run build
npm test
npm run dev
```

Open <http://localhost:3000>. You can build the interface and run most tests without credentials. For ingestion and persistence, see the [development guide](docs/DEVELOPMENT.md).

[Architecture](docs/ARCHITECTURE.md) · [Contribute](CONTRIBUTING.md) · [Security](SECURITY.md) · [MIT license](LICENSE) · [Brand assets](brand/README.md)
