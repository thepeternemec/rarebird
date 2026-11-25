# BTC Kumo experiment

The experiment estimates whether Kraken BTC/USD's next hourly close is at least
1% above or below the current hourly reference. NVIDIA Kumo Engine 1.0.0 is
compared with the recorded spot-range-hourly-v1 probability and its historical
base rate on identical labeled hours.

GET /api/v2/btc-pilot is a read-only export of at most 30 days of
closed BTC five-minute candles, 721 recorded BTC move-risk forecasts, and 6,000
recent BTC headline metadata records. Public market measurements and source-linked headline
metadata form its base export. The existing worker owns collection.

## Execution and measurements

The BTC Kumo pilot GitHub workflow validates preparation code on pull requests.
On main it runs after integration changes, on manual dispatch, and hourly at
minute 3 UTC. GitHub can delay scheduled jobs. A run outside the eight-minute
issuance window produces historical measurements and resolves existing entries.
A new prospective forecast requires a pending recorded baseline and must be
issued by eight minutes after its reference.

The Linux job uses Python 3.12 and CPU execution. It audits data before installing
Kumo. At least 120 eligible resolved hours and both classes in each fitting split
are needed to begin training. A warming_up report contains actual data counts
and baseline measurements. Each model variant has one experiment, three epochs,
a fixed seed and disabled refits and explanations. These settings test the
integration and measurement path.

Each run uploads btc-kumo-feeds-state containing report.json, journal.json and, when
a model completes, model.json. The workflow summary shows baseline, historical
held-out and prospective Brier scores. Reports include log loss, event counts,
calibration bins, missing observations, feature exclusions, dataset hash and
model metadata. Lower Brier and log loss are better. Historical measurements
are recomputed per run and never accumulated as prospective samples.

The next main-branch run restores the latest journal. A failed restore stops the
job. Predictions retain immutable hourly identities and probabilities. A retry
keeps the first forecast for that reference. Outcomes use the existing journal's
exact target close. Missing targets count separately and never receive zero
loss. The journal is cumulative and artifacts are retained for 90 days. If all
prior artifacts expire, the workflow begins a new journal and its counts restart.

## Point-in-time construction

Each entity represents a recorded BTC forecast hour. Inputs use 13 exactly
aligned five-minute candles ending at its reference, all first observed by the
original baseline's issue time. Invalid, discontinuous, missing and late-observed
inputs exclude that hour, with counts recorded in the report.

The graph connects each hour to at most ten of the newest BTC news arrivals
available by its issue time. Usable time is the later of publication and first
indexing. The original metadata-only comparison uses publisher, arrival age, 24-hour news
counts, publisher counts and coverage. The expanded model also receives headline
text and the shared feed graph described below. Truncation and history limits
affect the coverage indicator.

Each hour has distinct news-context nodes and no cross-hour graph edges.
Returns, volatility, range, volume, trading activity and UTC hour are inputs.
The target and comparison probabilities are excluded from model features.

Eligible resolved hours split chronologically at 60%, 70% and 80% into training,
validation, native test and outer held-out periods. Earlier partitions purge
seven hours before their boundary to cover the one-hour target and the existing
resolver's six-hour observation allowance. The graph passed to fit contains
only the first three partitions. Outer held-out and pending entities are added
after fitting finishes. Only training entities carry labels in graph data.
Caller-supplied labels and split assignments are passed independently through
Kumo's training-table API.

New prospective forecasts use frozen context and record the actual issue time
after inference. Reports include the model ID and dataset hash. Rarebird's
public forecast continues to use its existing recorded model.

## References

- https://github.com/NVIDIA/kumo-engine
- https://pypi.org/project/kumo-engine/1.0.0/
- https://docs.nvidia.com/sdgm/kumo-engine/user-code-guide/deploy-a-model/overview

## Shared feed graph

The expanded experiment uses the same BTC target and chronological partitions.
GET /api/v2/kumo-feeds?kind=news is a read-only, snapshot-bound paginated export.
The shared record contract contains entity identity, asset class, source link,
event time, first availability, expiry, headline or interpretation text,
numerical measurements, categories and source-record references.

| Feed | Source and history |
| --- | --- |
| News | Headline text and publisher metadata across the stored catalog. Availability is the later of publication and first indexing. |
| Interpretations | Immutable signal revisions, categories, affected entities, proposed mechanisms and direction. Availability includes revision recording and evidence availability. These remain model inferences. |
| Discovery | Recorded classified news and filing observations across the catalog. |
| Filings and financials | Existing SEC pilot snapshots, captured in the shared journal. Old disclosures become available at first capture, never at their historical fiscal date. |
| Market bars | Closed five-minute candles across the existing Kraken instruments, including crypto and tokenized equity proxies. |
| Market books | Observed spread, depth, imbalance and reference market impact from existing Kraken snapshots. |
| Market quotes | CoinGecko's ranked public basket, or the tracked-basket fallback, with provider observation time. |
| Funding | Binance or OKX rates for BTC, ETH and SOL, with available open interest. |
| DEX volume and stablecoins | DefiLlama public aggregate measurements and supported constituents. |
| Sentiment | Alternative.me's current fear-and-greed observation. |
| TVL | DefiLlama total and leading chain measurements. |
| Chain | Ethereum block and gas readings, and the Solana slot. |

The authenticated /api/cron/kumo-feeds collector runs every ten minutes. It
retains 30 days of immutable snapshots for feeds previously held only in cache.
A repeated observation keeps its first local availability. Feed failures are
isolated and recorded in collector health; stale readings are not inserted.
Existing news, interpretation, discovery and candle histories are read directly
rather than duplicated. Public exports never collect, generate interpretations
or train models. Account data and arbitrary visitor-specific token lookups are
outside this public feed dataset.

Each forecast receives separate entity and source-context nodes. Relationships
connect feed records to the forecast hour and its associated asset or chain.
Nodes never bridge forecast hours, so future context cannot travel backwards.
Inputs expire according to their source type. News samples reserve space for BTC,
other crypto and equity reporting; repeated URLs are deduplicated. Numerical and
categorical fields are typed explicitly. Headline, interpretation, filing and
financial-description text uses Kumo's explicit GloVe 50-dimensional text encoder
through the pinned text dependency. It is a word-vector representation, not
full article comprehension or verified causality.

The model requests sampling=hourly so source caps preserve older training history.
News keeps the first two arrivals per asset and at most 16 per hour. Other frequent
feeds keep their first observation per entity and at most five per hour; interpreted
and discovery events allow two per entity. Ties favor BTC or aggregate market
context. Filings and financials have a 100-record hourly cap. Market context uses
the last three fixed five-minute candle slots of each hour. Later arrivals cannot
displace earlier selections. Ordinary exports default to all records.

Downloads remain bounded to 12,000 catalog news records, 24,000 market bars and
4,000 records per other feed. The existing 6,000-record BTC news history also
carries headline text to preserve BTC context when the catalog export is capped.
Each report states export truncation, selected records, source states and
training/held-out hours with each feed. Snapshot histories begin at deployment;
they do not fill older examples retrospectively. A feed table and its count/presence features need observations in the training
partition before they can participate in a model. Columns and text availability
are frozen from training observations; validation-only or held-out fields cannot
introduce a new input branch.

## Paired model measurements

Each run fits two three-epoch CPU models with seed 42 on identical partitions:
the original market-and-news-metadata variant, and the expanded shared-feed
variant. Historical measurements compare them on exactly the same held-out hours,
alongside the existing recorded forecast and base rate. Brier and log-loss deltas
are shared feeds minus metadata-only; negative is better. The joint comparison
does not attribute a gain to a particular feed. Per-feed coverage shows which
inputs were actually available.

Expanded prospective predictions use the separate btc-kumo-feeds-v2 journal and
btc-kumo-feeds-state artifact. The original v1 artifacts retain their separate
history. The expanded journal records both variant probabilities before the
outcome, preserves the first prediction on retry and reports prospective scores
independently of historical results. Dataset identities include both the market
export and shared feed export. Rarebird's public forecast keeps its existing model
while these measurements accumulate.

BTC remains the first prediction target. The shared feed contract and context
graph support wider asset classes, but additional prediction targets require
their own labels and evaluation.
