# Rarebird

Open-source stock screening and experimental predictions for AI agents.

[![CI](https://github.com/thepeternemec/rarebird/actions/workflows/ci.yml/badge.svg)](https://github.com/thepeternemec/rarebird/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[Documentation](docs/README.md) · [Stock screener](https://www.rarebird.network/app/screener) · [Agent integration](AGENTS.md) · [Contributing](CONTRIBUTING.md)

Rarebird detects developing stock setups, preserves the measurements behind them, and records updates, expiry and forward outcomes. Agents can read the same records through MCP or REST. An optional signed webhook delivers lifecycle events to a configured receiver.

## Stock screening

The stock universe is an observed **S&P 500 snapshot of 503 securities**, compared with **SPY**. Membership is versioned; it is not a historical constituent dataset.

- Screen closed one-minute bars for five-minute relative strength, unusual participation and acceptable spreads.
- Keep detection independent of predictive models and generated explanations.
- Preserve a stable setup ID through detection, holds, invalidation and expiry.
- Freeze reference measurements and record 15- and 60-minute forward outcomes.
- Report missing data, source coverage, timestamps and readiness explicitly.

Alpaca supplies US-share identities, market clock, bars and quotes. IEX covers a single exchange; consolidated SIP data requires the relevant entitlement. Screening needs 66 aligned regular-session minutes to establish its daily baseline.

[Screening policy and lifecycle](docs/STOCK-SCREENER.md) · [Deploy and operate](docs/STOCK-OPERATIONS.md)

## NVIDIA Kumo Engine predictions

Rarebird integrates [NVIDIA Kumo Engine](https://github.com/NVIDIA/kumo-engine) to train relational models from structured data and its relationships. The stock worker pins `kumo-engine[text]==1.0.0` and runs separately from the web process.

| Property | Stock model |
| --- | --- |
| Target | Positive 15-minute beta-adjusted relative return after the stated cost scenario |
| Population | Detected stock setups; not an unconditional forecast for every constituent |
| Inputs | Frozen screening measurements and publisher/age relationships for news attached at detection |
| Training eligibility | At least 120 observed setup outcomes across six UTC trading dates, with both outcome classes in the fitting partitions |
| Validation | Chronological, purged partitions; frozen training-only base-rate comparison |
| Forward record | First accepted probability is immutable; paired Brier scores require 20 matching observations |
| Runtime | Persistent CPU worker with authenticated heartbeats and bounded retries |

The stock model does **not** consume every available feed. The shared feed graph and BTC experiment have separate mappings and targets. Feed availability, worker liveness, training eligibility and predictive performance are separate states. No stock predictive advantage or profitability has been established.

[Stock model methodology](docs/STOCK-SCREENER.md#stock-kumo-target-runtime-and-evaluation) · [Worker deployment](docs/STOCK-OPERATIONS.md) · [BTC experiment](docs/BTC-KUMO.md)

## Connect an agent

Add this remote MCP server in a client that supports Streamable HTTP:

```text
https://www.rarebird.network/api/mcp
```

Call `rarebird_stock_screener` to read setups, coverage and lifecycle events. Save `next_cursor`, pass it as `after`, and continue while `has_more`. Deduplicate event IDs and check the latest version, status and expiry before downstream use. Connecting MCP does not subscribe an agent to notifications.

The equivalent public REST reads are:

```bash
curl 'https://www.rarebird.network/api/v2/stock-screener'
curl 'https://www.rarebird.network/api/v2/stock-model'
```

For webhooks, configure a receiver and signing secret using the [delivery guide](docs/STOCK-SCREENER.md#receive-signed-lifecycle-notifications).

[Agent reference](AGENTS.md) · [Integration examples](examples/README.md) · [Connection guide](https://www.rarebird.network/docs/connect#stock-screener)

## Data feeds

All existing feed integrations remain available: headlines, interpreted events, discoveries, filings, financial statements, market bars, order books, quotes, funding, DEX volume, stablecoin supply, sentiment, TVL and chain observations.

The catalog includes stock and crypto research alongside the S&P 500 screener. Coverage and freshness vary by source. Each feed record retains provenance and an availability window; a feed being present does not establish that a model uses it.

[Feed catalog and contracts](docs/DATA-FEEDS.md) · [News collection](docs/COLLECTION.md) · [Research](docs/RESEARCH.md) · [Market methodology](docs/QUANTITATIVE.md)

## Architecture

| Location | Responsibility |
| --- | --- |
| `apps/web` | Next.js app, API mount and scheduled routes |
| `apps/api` | REST/MCP handlers, detection, lifecycle storage and model publication |
| `apps/worker` | Collection, matching and ingestion |
| `packages/contracts` | Schemas, catalogs, tool definitions and universe snapshot |
| `packages/db`, `db` | PostgreSQL access, schema and migrations |
| `scripts/kumo-stocks` | Stock Kumo fitting, scoring and heartbeat process |
| `scripts/kumo-btc` | Separate BTC relational-model experiment |

[Architecture](docs/ARCHITECTURE.md) · [Capability boundaries](docs/STATUS.md)

## Development

Use Node.js 22 or 24 and npm. The Kumo container uses Python 3.12 and CPU PyTorch.

```bash
git clone https://github.com/thepeternemec/rarebird.git
cd rarebird
npm ci
npm run build
npm test
npm run dev
```

Open <http://localhost:3000>. The interface and standard tests can run without provider credentials. Populated data and operational workers require configuration.

For stock activation, configure Alpaca and PostgreSQL, deploy the worker with a matching `RAREBIRD_STOCK_MODEL_SECRET`, then run:

```bash
npm run stocks:doctor -- --json
```

This check reads status only. It does not create setups or send test notifications. An unconfigured delivery receiver or disconnected worker produces an unfinished check.

[Local setup](docs/DEVELOPMENT.md) · [Operations](docs/STOCK-OPERATIONS.md) · [Docker Compose](deploy/stock-kumo.compose.yml)

## Contribute

Contributions are welcome in data quality, point-in-time evaluation, provider adapters, agent interoperability, accessibility and documentation. Start with a reproducible issue or a focused pull request.

[Contribution guide](CONTRIBUTING.md) · [Report an issue](https://github.com/thepeternemec/rarebird/issues) · [Security](SECURITY.md) · [Code of conduct](CODE_OF_CONDUCT.md) · [MIT license](LICENSE)
