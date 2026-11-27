# Architecture

Rarebird separates collection, immediate detection, model scoring and agent reads. PostgreSQL is the durable record for source observations, setup lifecycle events, accepted predictions and measured outcomes.

## Runtime boundaries

| Component | Responsibility |
| --- | --- |
| `apps/web` | Next.js interface, Hono API mount, authenticated scheduled routes |
| `apps/api` | REST/MCP, detection rules, episode lifecycle, webhook outbox and prediction publication |
| `apps/worker` | News collection, asset matching and normalization |
| `packages/contracts` | Shared schemas, tool definitions, catalog and S&P 500 snapshot |
| `packages/db`, `db` | PostgreSQL access, schema and migrations |
| `scripts/kumo-stocks` | Persistent Python CPU worker for stock training, scoring and heartbeats |
| `scripts/kumo-btc` | Separate BTC graph-model experiment and measurement workflow |

## Stock setup path

The authenticated one-minute scheduled worker verifies Alpaca instrument identities and reads closed bars, quotes and the market clock. The optional Node streaming runner supplies the same detection pipeline. Deterministic rules evaluate past-only strength, volume, spread and freshness independently of model generation.

A database lease bounds concurrent scans. Each qualifying episode freezes its initial reference, carries a stable ID and records lifecycle changes transactionally with optional delivery outbox entries. Outcomes use first-observed closed bars; missing measurements remain missing. REST and MCP read stored records and project expired or stale measurements into the appropriate hold state.

## Kumo prediction path

The Python stock worker reads the bounded `/api/v2/stock-model?dataset=1` export. Training uses frozen screening measurements and attached news context, with chronological purges and separate fit, validation and test cohorts. Eligibility requires 120 observed setup outcomes across six UTC trading dates and both classes in fitting partitions.

The worker publishes authenticated heartbeats and probabilities to `/api/cron/stock-kumo` using `RAREBIRD_STOCK_MODEL_SECRET`. It needs no broker or database credentials. The first accepted probability for an episode is immutable. Paired forward Brier scores compare predictions with a frozen training-only base rate after enough matching observations.

The web project is rooted at `apps/web` on Vercel. The separate Kumo project uses the repository-root daemon configuration and `scripts/kumo-stocks/Dockerfile`. Vercel daemon files are ephemeral; accepted predictions, outcomes and heartbeat timestamps remain in PostgreSQL. Docker Compose with a retained volume is also supported. See [stock operations](STOCK-OPERATIONS.md).

## Other data and research paths

All fourteen shared graph feeds, source integrations, existing REST/MCP tools, research handlers and BTC measurements remain available. News collection and explicit question research have their own schedules and cost boundaries; public stored reads do not start collection or generate explanations. Model inputs differ by experiment. See [the feed catalog](DATA-FEEDS.md), [research](RESEARCH.md), [market methodology](QUANTITATIVE.md) and [BTC experiment](BTC-KUMO.md).

## Verification

CI builds the TypeScript workspaces and tests contracts and application behavior. A disposable PostgreSQL job verifies ingestion, event memory, the stock lifecycle and prediction records. The Kumo deployment image has a separate actual fit/predict smoke test on isolated synthetic data. These are implementation checks, not evidence of market performance.
