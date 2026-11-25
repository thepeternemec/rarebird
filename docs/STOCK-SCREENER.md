# Stock screener: first implementation

Rarebird’s first stock screen follows **NVDA, AAPL, MSFT and GOOGL US shares**, with **SPY** as the market benchmark. It detects developing relative strength, records a setup once, follows its lifecycle and measures what happens next. It does not place orders.

The app is at [/app/screener](https://www.rarebird.network/app/screener). Its source status is authoritative: **`not_configured` means no US-share price feed has been connected**, not that the market has no opportunities. Implementing or deploying the code does not activate data access, a streaming worker or a notification destination.

## Connect your agent

Add the existing MCP URL; there is no second MCP to install:

```text
https://www.rarebird.network/api/mcp
```

Call `rarebird_stock_screener` with `{}`. This returns the current status, four-stock coverage, active/held setups, recent setup records, forward outcomes and recent lifecycle events. It is a stored read: it does not fetch prices, start monitoring or create a notification subscription.

After processing the events, save `next_cursor`. Call again with `{"after":"SAVED_CURSOR","limit":20}` and keep paging while `has_more`. Only advance the cursor after processing each page. `{"after":"0"}` starts at the beginning of the retained journal. Event IDs are stable; alert versions increase for lifecycle changes. The journal retains 30 days; a cursor is not a guarantee of history beyond that window. `recent` contains the latest 80 setup records; older retained events remain cursor-readable.

REST uses the same result:

```bash
curl 'https://www.rarebird.network/api/v2/stock-screener'
curl 'https://www.rarebird.network/api/v2/stock-screener?after=0&limit=20'
```

| Field or state | Agent behavior |
| --- | --- |
| `status: monitoring` | Some stock measurements are usable. Check each asset’s coverage and setup state. |
| `not_configured`, `unavailable`, `data_hold` | Report the missing connection or measurement. Do not interpret an empty result as a quiet market. |
| `market_closed` | Regular-session screening is paused. |
| `warming_up` | Today’s aligned intraday baseline is incomplete. |
| `active` setup | Investigate the measurements and linked reporting while `valid_until` is still in the future. |
| `data_hold` setup | Current data is missing or stale. A hold does not establish that the setup failed. |
| `invalidated` / `expired` | The measured conditions cleared, the move became extended, or the 15-minute lifetime elapsed. |
| `evidence` | Reporting already known at detection, with publication and first-indexed times. Context, not proof of causality. |
| `reference` / `latest` | Frozen detection measurements / latest qualifying measurement. Never reset the reference for the same episode. |

The app and public reads also project stale setups to a hold or expiry when the worker is unavailable. These projected states do not append journal events; the next authorized worker run records the lifecycle change.

## Connect the US-share feed

Use an Alpaca account with credentials and market-data entitlements appropriate for the intended audience and distribution. The feed is independent of Rarebird’s older Kraken xStock/crypto pilot. No tokenized share or delayed feed substitutes for an underlying US-share quote.

| Server environment | Purpose |
| --- | --- |
| `DATABASE_URL` | Existing PostgreSQL storage. |
| `ALPACA_API_KEY`, `ALPACA_SECRET_KEY` | Alpaca paper-account keys used only for asset identity, the market clock and market-data reads. Standard `APCA_API_KEY_ID` / `APCA_API_SECRET_KEY` aliases also work. No order endpoints are called. |
| `RAREBIRD_STOCK_FEED=iex` | Default: IEX exchange trades and quotes only. Volume is exchange-specific, not total US-market volume or NBBO. |
| `RAREBIRD_STOCK_FEED=sip` | Optional consolidated US-market feed, requiring entitlement. Entitlement failures hold the screen; there is no delayed-data fallback. |
| `CRON_SECRET` | Existing bearer secret for the scheduled worker. |

The adapter verifies exact symbols, active/tradable `us_equity` identities and listed exchanges for all four stocks and SPY. It reads the provider clock, paginates minute bars and checks quote freshness. Bad identities, missing bars, stale/crossed quotes, unstable baselines and wide spreads hold the affected screen. Extended hours are excluded; the provider clock determines exchange holidays and early closes. This v1 does not ingest exchange halt/status messages: a stopped tape eventually fails freshness gates, and a quote jump beyond the last minute’s context is held.

### Scheduled deployment

Vercel invokes authenticated `/api/cron/stock-screener` every minute. With no feed credentials it returns `not_configured` without making provider requests or creating storage. Once credentials and storage are configured, the worker initializes its additive schema, acquires a cross-process lease, measures the four stocks, saves lifecycle events and flushes the optional notification outbox.

This is **one-minute scheduled screening**, not a continuously connected streaming deployment. Public page refreshes every 15 seconds do not accelerate the scan. Source timestamps and mode are included in the response.

### Continuous streaming worker

For an always-on connection, run a separate Node 22+ process with the same database, feed and optional webhook environment:

```bash
npm ci
npm run build:packages
npm run build -w @rarebird/api
npm run stocks:worker
```

Use a long-lived process host or process manager; a Vercel request is not an always-on WebSocket host. The runner bootstraps bars through REST, authenticates to the entitled Alpaca stock stream, subscribes to the five symbols’ quotes and minute bars, coalesces arriving stock/SPY bars, checks the market clock and reconnects with backoff. It screens **closed one-minute bars**, not every trade. Quotes stay in memory; first-observed closed bars are frozen in PostgreSQL. A disconnected stream cannot silently reuse an old quote as current.

Fresh healthy streaming scans suppress the scheduled worker; stale or failed streaming measurements allow the scheduled REST fallback. Do not run multiple streaming replicas on a single-connection provider entitlement. The database lease protects writes, not the provider’s WebSocket connection quota.

## The first detection policy

Policy: `stock-relative-strength-v1`. These are initial fixed research rules, not optimized or validated trading thresholds.

1. Use 66 consecutive aligned closed minutes from today’s regular session. Fit the stock’s market sensitivity on the first 60 one-minute returns. The last five returns are the screening window, excluded from fitting.
2. Require a positive stock move, at least 25 bp of five-minute market-adjusted strength, a residual statistic of at least 2.5, and volume at least 1.8 times the median of the preceding twelve non-overlapping five-minute windows.
3. Require fresh stock/SPY quotes within 30 seconds, aligned bars within 90 seconds and spreads no wider than 15 bp. Hold a quote more than 25 bp from its last closed-bar price until the next complete minute.
4. Suppress fresh alerts if the residual statistic reaches 6, the five-minute residual reaches 100 bp, or the prior 25-minute relative move already exceeds 1%. These guards reduce chasing; they do not establish an entry advantage.
5. Refresh a continuing setup’s two-minute validity without creating another alert. Close on a measured reset/extended move, or after 15 minutes. Missing measurements cause a hold. After closure, enforce a 20-minute cooldown before a new setup in that stock/feed/policy.

The baseline resets every session. Screening starts no earlier than 66 aligned trading minutes after the open; missing trades can delay it further. Beta/residual statistics use an intraday descriptive fit and a volatility floor; they are not calibrated probabilities. Volume’s comparison windows are intraday, not a historical time-of-day seasonality model. The first version detects long-side strength only.

## Receive signed lifecycle notifications

The operator can configure one endpoint:

```text
RAREBIRD_STOCK_SCREENER_WEBHOOK_URL=https://your-agent.example/rarebird
RAREBIRD_STOCK_SCREENER_WEBHOOK_SECRET=<random-secret-at-least-32-characters>
```

Both must be set. Destinations require public HTTPS with no embedded credentials; redirects are refused. No endpoint is registered by a public MCP read. `delivery.configured` means valid configuration, not that a message has been received; delivery counters expose pending, delivered and failed attempts. There is no self-service per-user subscription UI in this first version.

Events are written atomically with the alert and outbox. Delivery is at least once, retries up to five attempts with backoff, and uses an eight-second request timeout. Events older than five minutes, obsolete creation/resumption events and events for a changed destination are skipped rather than sending stale setup prompts. They remain readable in the retained journal. Retry arrival order is not guaranteed: deduplicate event IDs and retain the greatest version per alert. Recover gaps from the REST/MCP cursor.

Each body is a `StockScreenEvent` with `id`, decimal `sequence`, `type`, `recorded_at` and the versioned `alert`. Headers:

```text
X-Rarebird-Event-ID: <stable event ID>
X-Rarebird-Timestamp: <Unix seconds>
X-Rarebird-Signature: v1=<hex HMAC-SHA256>
```

Verify the exact raw body before parsing:

```js
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyRarebird(headers, rawBody, secret) {
  const timestamp = headers.get("x-rarebird-timestamp") ?? "";
  if (!/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = Buffer.from("v1=" + createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`).digest("hex"));
  const actual = Buffer.from(headers.get("x-rarebird-signature") ?? "");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
```

After verification, persist/deduplicate the event before returning 2xx. For creation/resumption, check the current setup, source status and expiry before taking any downstream action. Notifications are investigation prompts; this integration has no broker execution path.

## Measure usefulness

Each detected episode freezes its original stock/SPY quote reference, beta, spread, timestamps and policy. Both failed and surviving setups stay in the evaluation cohort. At 15 and 60 minutes, the worker records the first aligned closed traded minute at/after the horizon, with a two-minute observation grace. Future observations and bars first received after that deadline cannot fill a missed outcome. Missing outcomes stay missing, including session-close and feed-disconnection gaps.

The cost scenario subtracts **20 bp plus the frozen entry spread** from the benchmark-adjusted log move. It does not model fills, a realizable benchmark hedge, borrow, market impact or dynamic slippage. The response’s evaluation summary counts **15-minute horizons only**, across the retained 30-day policy/feed cohort; both horizons are present on individual setup records. A mean is withheld before 20 observed 15-minute horizons. There is no claimed win probability, profitability or demonstrated edge.

Use event/measurement timestamps to evaluate detection delay, delivery counts to evaluate notification reliability, and observed/missing horizons to evaluate coverage. Accumulate forward data before changing thresholds. Compare future policy versions on matched sessions and feed coverage; IEX and SIP cohorts must remain separate.

The stock screen currently uses deterministic measurements and already-stored reporting. The separate BTC Kumo experiment does not rank these stock setups or supply a stock return model.

## Verification

Pure tests cover relative-strength isolation, pre-window fitting, stale/bad feed rejection, episode identity/cooldown, reference stability and future/late-outcome exclusion. Disposable PostgreSQL tests cover atomic lifecycle storage, first-observation immutability, event pagination, resumed episodes, signed delivery/retries and expired-notification suppression. CI runs the persistence tests against its dedicated test database; fixtures are never used by the app or production worker.
