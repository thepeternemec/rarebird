# Capability boundaries

Updated 27 November 2026. This describes implementation scope; deployment readiness is reported by the live API.

| Component | Implemented behavior | Boundary |
| --- | --- | --- |
| Stock screener | Versioned S&P 500 snapshot of 503 securities versus SPY; Alpaca bars/quotes; deterministic relative-strength and participation checks | Regular session, 66 aligned-minute baseline; IEX or entitled SIP coverage |
| Setup lifecycle | Stable IDs, updates, holds, invalidation, expiry and frozen 15/60-minute observations | Reference observations, not executed trades |
| Agent integration | MCP, REST, cursor replay and optional signed webhook outbox | Webhook delivery needs a configured receiver and actual acknowledgements |
| Stock Kumo worker | Separate CPU fitting/scoring process, authenticated heartbeats, immutable probabilities and paired forward evaluation | At least 120 observed outcomes across six UTC trading dates before fitting eligibility; no established stock predictive advantage |
| Shared feed graph | Fourteen time-aware feed kinds with source and availability metadata | Source-dependent gaps, retention and sampling; not all feeds are stock-model inputs |
| BTC Kumo experiment | Separate next-hour 1% move target, chronological comparisons and prospective journal | Its measurements do not validate the stock model |
| News and research | Stock/crypto catalog, source-linked reporting, grouping, question research and supporting market utilities | Headline metadata and explicit per-source freshness/coverage limits |

Check `/api/v2/stock-screener` and `/api/v2/stock-model`, or run `npm run stocks:doctor -- --json`. Model worker liveness, training eligibility, source readiness and performance are separate checks. A warming-up worker has not produced a fitted stock model.

[Stock methodology](STOCK-SCREENER.md) · [Activation](STOCK-OPERATIONS.md) · [Feed catalog](DATA-FEEDS.md)
