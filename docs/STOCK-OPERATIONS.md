# Activate the S&P 500 service

The web deployment contains the detector, lifecycle journal, notification outbox and Kumo publication API. Deploying it does not connect a price feed or start a Python process. Use this guide to activate those services and verify their actual state.

## 1. Connect stock data on Vercel

In the Rarebird project's **production** environment, configure `ALPACA_API_KEY` and `ALPACA_SECRET_KEY` from the intended Alpaca account. Set `RAREBIRD_STOCK_FEED=iex`, or `sip` when that account is entitled. Keep the existing `DATABASE_URL` and scheduled-worker `CRON_SECRET`. Redeploy after changing environment variables.

The existing one-minute Vercel cron then collects closed minute bars, verifies constituent identities, records setups and follows their outcomes. `not_configured` means missing credentials, not an empty market. `warming_up` means the detector needs 66 aligned regular-session minutes. Missing or stale measurements hold screening. IEX is one exchange, not consolidated US-market coverage.

## 2. Choose the notification receiver

Configure the operator's intended public HTTPS endpoint as `RAREBIRD_STOCK_SCREENER_WEBHOOK_URL`, with a separate random `RAREBIRD_STOCK_SCREENER_WEBHOOK_SECRET` of at least 32 characters. Configure that same signing secret in the receiver, and verify raw-body HMAC signatures as described in [the notification guide](STOCK-SCREENER.md#receive-signed-lifecycle-notifications).

There is one operator destination in this version. MCP reads do not register a subscriber. A configured endpoint has not been proven to work until a real event receives a successful acknowledgement. Deduplicate event IDs and recover gaps using the journal cursor.

## 3. Configure the stock-model connection

Set a separate random `RAREBIRD_STOCK_MODEL_SECRET` on Vercel and the intended Python host. This secret is accepted only by the stock-model publication and heartbeat endpoint. The Python host does not need database, broker or notification credentials. If the dedicated secret is absent, `CRON_SECRET` remains supported for compatibility.

Keep the populated host environment file outside the repository, readable only by its operator. It needs just:

```dotenv
RAREBIRD_STOCK_MODEL_SECRET=<same stock-model secret as Vercel>
RAREBIRD_STOCK_ORIGIN=https://www.rarebird.network
```

## 4. Start the persistent Kumo worker

Use an existing Linux x86-64 Docker host with Compose and retained disk. The repository includes a CPU image with Python 3.12, pinned Kumo Engine and CPU PyTorch. It runs as a non-root user. CI builds this exact image and performs an actual graph fit and prediction inside it on isolated synthetic rows.

From the repository root, after configuring the host environment file:

```bash
docker compose --env-file /secure/rarebird-stock.env -f deploy/stock-kumo.compose.yml up --build -d
docker compose --env-file /secure/rarebird-stock.env -f deploy/stock-kumo.compose.yml ps
docker compose --env-file /secure/rarebird-stock.env -f deploy/stock-kumo.compose.yml logs --tail=30 stock-kumo
```

The named volume keeps model bundles and reports. Creating this manifest does not provision or pay for a host. Run one worker against that volume. An output-directory lock prevents accidental duplicate local processes.

### Vercel Daemons deployment

Vercel now supports continuous containers through [Daemons](https://vercel.com/docs/daemons). Keep the Rarebird web project rooted at `apps/web` with its existing configuration. For the separate `kumo-stocks` project, set Root Directory to the repository root (blank), Framework Preset to Other, and remove dashboard build/install/output overrides so the root `vercel.json` applies. Daemons currently require the repository root. The root configuration explicitly disables Python web-framework detection and builds the existing Dockerfile as a daemon. No Python HTTP entrypoint is needed.

The status landing page identifies the deployment and links to the actual model status API; it never claims that the daemon is running. The configuration declares zero instances initially. After setting the same `RAREBIRD_STOCK_MODEL_SECRET` in both projects' production environments and redeploying, scale `stock-kumo` to one instance in `iad1` in the Daemons dashboard. This override survives future deployments. The instance requests 4 GiB and uses Vercel compute and memory billing while running. Leave it at zero until credentials and data access are ready.

Vercel daemon disk is ephemeral. Predictions, outcomes and liveness remain durable in Rarebird's existing database, and replacement workers fit again from retained server observations. Host-local model bundles and reports are temporary on this deployment; use external storage for a durable bundle archive. For persistent local audit bundles, the Docker Compose deployment above remains available. Vercel restarts exited processes; the Dockerfile's local health check is not configured as a Vercel HTTP liveness probe.

The worker retries failed requests, fitting and publication with bounded backoff. It refreshes the active population after fitting, skips already-published episodes and avoids hourly refitting when fitting data is unchanged. It refreshes an unchanged model before the publication age limit. Redirects are refused, including authenticated uploads. Reports and batches are written atomically; public errors use fixed codes rather than exception strings that might contain secrets.

The health check reads the local status file. A background heartbeat continues during fitting and is recorded on the API with server time. The app shows a disconnected worker after three minutes without a heartbeat. A healthy container can still be **blocked** by an unconfigured feed or warming up for observations; liveness does not establish readiness or predictive accuracy.

Training requires at least 120 correctly observed 15-minute setup outcomes across six UTC trading dates, both outcome classes in the fitting partitions, and the existing chronological purges. These are minimum eligibility checks. There are no stock predictions before an actual fit. The target and forward evaluation remain documented in [the model guide](STOCK-SCREENER.md#stock-kumo-target-runtime-and-evaluation).

For a native Python 3.12 host, the equivalent process is:

```bash
python -m pip install -r scripts/kumo-stocks/requirements.txt
python scripts/kumo-stocks/predict.py --output /data/rarebird-stock-model --watch --publish
```

Run it under the host's existing process supervisor. Restarting currently fits a new model from retained server observations; bundles are retained for audit, not silently restored into serving.

## 5. Verify without sending test signals

```bash
npm run stocks:doctor
npm run stocks:doctor -- --json
```

This performs public reads only. It checks matching feed and universe versions, feed configuration, detector freshness, notification configuration and fresh model-worker liveness. A missing check exits with code 1 and names the component. Training can legitimately be in warm-up while the service configuration is ready. It reports acknowledgement and prediction counts without fabricating a setup, delivering a test notification or claiming an outcome.

Then follow one real eligible setup through its record. Verify the receiver's acknowledgement, subsequent update/hold/expiry events and the recorded 15/60-minute outcomes. Kumo's first accepted probability is immutable. Accuracy counts and paired Brier scores are separate from worker liveness and are withheld below the existing observation minimum.

To stop model scoring, stop the Compose service using the same environment-file flag. The model reports `stopped`, or becomes stale if the process is killed. Rule-based detection and expiry continue independently. Keep the volume when restarting; deleting the volume removes the host's audit bundles and reports.
