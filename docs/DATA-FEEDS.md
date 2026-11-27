# Data feeds

The stock screener, shared feed graph and BTC experiment use different data mappings. All feed integrations are retained; inclusion here does not mean a feed is an input to the stock model.

## Stock screening inputs

Alpaca provides actual US-share identities, regular-session market clock, closed minute bars and latest quotes. The detector compares the versioned S&P 500 security snapshot against SPY. IEX is single-exchange coverage; SIP needs entitlement. News attached at detection provides source context.

The stock Kumo model uses frozen screening features and publisher/age relationships for attached news. See [the exact target and validation](STOCK-SCREENER.md#stock-kumo-target-runtime-and-evaluation).

## Shared graph export

`GET /api/v2/kumo-feeds?kind=news` reads stored records. Select one of the following exact `kind` values:

| Kind | Records |
| --- | --- |
| `news` | Source-linked headlines |
| `interpretation` | Stored interpretation revisions |
| `discovery` | Recorded market/news discoveries |
| `filing` | Official filing observations |
| `financial` | Reported financial comparisons |
| `market_bar` | Closed market candles |
| `market_book` | Order-book snapshots |
| `market_quote` | Market quote snapshots |
| `funding` | Funding-rate observations |
| `dex_volume` | DEX trading-volume observations |
| `stablecoins` | Stablecoin supply observations |
| `sentiment` | Sentiment index observations |
| `tvl` | Total value locked observations |
| `chain` | Chain state observations |

Records carry source URLs, entity and asset-class identities, event time, first availability, expiry, text, numeric values and related IDs. Follow `next_cursor` while preserving the returned time window. `sampling=hourly` is a bounded historical sampling mode. Check status, source errors, retention and truncation rather than interpreting missing records as zero activity.

The immutable snapshot journal retains 30 days. Historical context starts at first capture; it is not reconstructed from information learned later. Closed candles and existing source-table histories keep their own collection semantics. Prediction outcomes are targets, not public source observations in this feed contract.

## Source and implementation references

- [Shared record schema](../packages/contracts/src/kumo-feeds.ts)
- [Feed normalization](../apps/api/src/lib/kumo-feed-core.ts)
- [Paginated export](../apps/api/src/lib/kumo-feeds.ts)
- [Stock provider](../apps/api/src/lib/stock-screener-provider.ts)
- [BTC graph mapping and measurements](BTC-KUMO.md)
- [News collection](COLLECTION.md)

Source-specific entitlements and coverage still apply. A successful collection may contain no matching reports; a failed collection is not a quiet market.
