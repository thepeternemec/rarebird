# BTC Kumo experiment

The experiment estimates whether Kraken BTC/USD's next hourly close is at least
1% above or below the current hourly reference. NVIDIA Kumo Engine 1.0.0 is
compared with the recorded spot-range-hourly-v1 probability and its historical
base rate on identical labeled hours.

GET /api/v2/experiments/btc/dataset is a read-only export of at most 30 days of
closed BTC five-minute candles, 721 recorded BTC move-risk forecasts, and 6,000
recent BTC news metadata records. Public market measurements and publisher
metadata form its inputs. The existing worker owns collection.

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
and baseline measurements. Each training run has one experiment, three epochs,
a fixed seed and disabled refits and explanations. These settings test the
integration and measurement path.

Each run uploads btc-kumo-state containing report.json, journal.json and, when
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
indexing. Inputs include publisher, arrival age, 24-hour news counts, publisher
counts and coverage. Truncation and history limits affect the coverage indicator.
Headline semantics are outside this initial model.

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
