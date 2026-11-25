import {
  STOCK_SCREENER_POLICY, STOCK_SCREENER_UNIVERSE,
  type StockAlert, type StockBar, type StockFeed, type StockFrame, type StockScreenEvent, type StockScreenResult,
} from "@rarebird/contracts";

const MINUTE = 60_000;
export const SCREEN_RULES = {
  window_minutes: 5, baseline_returns: 60, min_relative_bps: 25, min_z: 2.5, max_z: 6,
  max_relative_bps: 100, min_relative_volume: 1.8, max_spread_bps: 15,
  quote_age_ms: 30_000, bar_age_ms: 90_000, validity_ms: 120_000,
  lifetime_ms: 15 * MINUTE, cooldown_ms: 20 * MINUTE, assumed_round_trip_cost_bps: 20,
} as const;
const ny = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function stockSession(time: number) {
  const parts = Object.fromEntries(ny.formatToParts(time).map(p => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) };
}
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return (sorted[Math.floor((sorted.length - 1) / 2)]! + sorted[Math.floor(sorted.length / 2)]!) / 2; };
const round = (n: number) => Math.round(n * 1000) / 1000;
const iso = (n: number) => new Date(n).toISOString();
const logReturn = (a: StockBar, b: StockBar) => Math.log(b.close / a.close);
function validBars(bars: StockBar[], now: number) {
  const seen = new Set<number>();
  for (const b of bars) {
    if (!Number.isFinite(b.time) || b.time % MINUTE || seen.has(b.time)
      || ![b.open, b.high, b.low, b.close].every(x => Number.isFinite(x) && x > 0)
      || !Number.isFinite(b.volume) || b.volume < 0 || b.high < Math.max(b.open, b.close)
      || b.low > Math.min(b.open, b.close) || b.low > b.high || b.time > now) return false;
    seen.add(b.time);
  }
  return true;
}

/** A bounded, past-only screen of US shares. No generated interpretation or execution. */
export function screenStock(frame: StockFrame, symbol: (typeof STOCK_SCREENER_UNIVERSE)[number]["symbol"], now: number): StockScreenResult {
  const asset = STOCK_SCREENER_UNIVERSE.find(item => item.symbol === symbol)!;
  const result = (state: StockScreenResult["state"], reason: string, metrics: StockScreenResult["metrics"] = null): StockScreenResult => ({ ...asset, state, reason, metrics });
  if (!Number.isFinite(Date.parse(frame.received_at)) || Date.parse(frame.received_at) > now + 5000
    || now - Date.parse(frame.received_at) > 90_000 || !Number.isFinite(Date.parse(frame.session_checked_at))
    || Date.parse(frame.session_checked_at) > now + 5000 || now - Date.parse(frame.session_checked_at) > 90_000)
    return result("data_hold", "The feed or market-session check is stale.");
  if (!frame.session_open) return result("data_hold", "The US regular trading session is closed.");
  const stock = frame.instruments[symbol], benchmark = frame.instruments.SPY;
  if (![stock, benchmark].every(item => item?.verified && item.asset_class === "us_equity")
    || stock?.symbol !== symbol || benchmark?.symbol !== "SPY") return result("data_hold", "Verified US-share identity is missing.");
  if (!validBars(stock!.bars, now) || !validBars(benchmark!.bars, now)) return result("data_hold", "The minute-bar sequence is invalid.");
  const session = stockSession(now);
  if (session.minute < 570 || session.minute >= 960) return result("data_hold", "Outside the US regular trading session.");
  const inSession = (b: StockBar) => {
    const s = stockSession(b.time);
    return b.time + MINUTE <= now && s.day === session.day && s.minute >= 570 && s.minute < 960;
  };
  const byTime = new Map(benchmark!.bars.filter(inSession).map(b => [b.time, b]));
  const pairs = stock!.bars.filter(inSession).filter(b => byTime.has(b.time)).sort((a, b) => a.time - b.time)
    .map(b => [b, byTime.get(b.time)!] as const).slice(-66);
  if (pairs.some((pair, i) => i && pair[0].time !== pairs[i - 1]![0].time + MINUTE))
    return result("data_hold", "Stock and benchmark minutes have a gap; missing trades are not filled.");
  const last = pairs.at(-1), measured = last ? last[0].time + MINUTE : 0;
  if (last && now - measured > SCREEN_RULES.bar_age_ms) return result("data_hold", "The latest aligned minute is no longer current.");
  const quotes = [stock!.quote, benchmark!.quote];
  if (quotes.some(q => !q || ![q.time, q.bid, q.ask, q.bid_size, q.ask_size].every(Number.isFinite)
    || q.bid <= 0 || q.ask < q.bid || q.bid_size <= 0 || q.ask_size <= 0
    || q.time > now + 5000 || now - q.time > SCREEN_RULES.quote_age_ms)) return result("data_hold", "A fresh, uncrossed stock and benchmark quote is required.");
  if (pairs.length < 66) return result("warming_up", "Need 66 aligned, closed minute bars in this trading session.");
  const quote = stock!.quote!, benchmarkQuote = benchmark!.quote!;
  const x = pairs.slice(1, 61).map((p, i) => logReturn(pairs[i]![1], p[1]));
  const y = pairs.slice(1, 61).map((p, i) => logReturn(pairs[i]![0], p[0]));
  const mx = mean(x), my = mean(y), variance = mean(x.map(v => (v - mx) ** 2));
  if (variance < 1e-10) return result("warming_up", "The benchmark baseline has insufficient variation.");
  const beta = mean(x.map((v, i) => (v - mx) * (y[i]! - my))) / variance;
  if (!Number.isFinite(beta) || Math.abs(beta) > 5) return result("data_hold", "The pre-window market baseline is unstable.");
  const intercept = my - beta * mx;
  const sigma = Math.max(0.0003, Math.sqrt(mean(y.map((v, i) => (v - intercept - beta * x[i]!) ** 2))));
  const a = logReturn(pairs[60]![0], last![0]), b = logReturn(pairs[60]![1], last![1]);
  const relative = a - beta * b - 5 * intercept, z = relative / (sigma * Math.sqrt(5));
  const volumes = Array.from({ length: 12 }, (_, i) => pairs.slice(i * 5 + 1, i * 5 + 6).reduce((sum, p) => sum + p[0].volume, 0));
  const baseVolume = median(volumes), volume = pairs.slice(61).reduce((sum, p) => sum + p[0].volume, 0);
  if (!baseVolume || !volume) return result("data_hold", "There is no comparable traded-volume baseline.");
  const price = (quote.bid + quote.ask) / 2, benchmarkPrice = (benchmarkQuote.bid + benchmarkQuote.ask) / 2;
  const spread = (quote.ask - quote.bid) / price * 10_000;
  if ((benchmarkQuote.ask - benchmarkQuote.bid) / benchmarkPrice * 10_000 > SCREEN_RULES.max_spread_bps)
    return result("data_hold", "The benchmark quote spread exceeds the screening limit.");
  if (Math.abs(Math.log(price / last![0].close)) > 0.0025 || Math.abs(Math.log(benchmarkPrice / last![1].close)) > 0.0025)
    return result("data_hold", "The quote has moved beyond the latest closed-minute context. Wait for the next complete minute.");
  const metrics = {
    measured_at: iso(measured), window_minutes: 5 as const, price, benchmark_price: benchmarkPrice,
    asset_return_bps: round(Math.expm1(a) * 10_000), benchmark_return_bps: round(Math.expm1(b) * 10_000),
    relative_return_bps: round(relative * 10_000), residual_z: round(z), relative_volume: round(volume / baseVolume),
    spread_bps: round(spread), beta, baseline_samples: 60, baseline_end_at: iso(pairs[60]![0].time + MINUTE), quote_at: iso(quote.time),
  };
  if (spread > SCREEN_RULES.max_spread_bps) return result("data_hold", "The observed spread exceeds the screening limit.", metrics);
  const prior = logReturn(pairs[35]![0], pairs[60]![0]) - beta * logReturn(pairs[35]![1], pairs[60]![1]) - 25 * intercept;
  if (z >= SCREEN_RULES.max_z || relative * 10_000 >= SCREEN_RULES.max_relative_bps || prior >= 0.01)
    return result("extended", "The measured move is already extended for this setup; no fresh alert.", metrics);
  if (a <= 0 || relative * 10_000 < SCREEN_RULES.min_relative_bps || z < SCREEN_RULES.min_z || volume / baseVolume < SCREEN_RULES.min_relative_volume)
    return result("quiet", "Relative strength and participation do not both pass the setup rules.", metrics);
  return result("candidate", "Developing relative strength with unusual traded volume. Investigate the setup; a cause is not established.", metrics);
}

export function evolveStockAlert(previous: StockAlert | null, screen: StockScreenResult, now: number, feed: StockFeed, id: string): { alert: StockAlert | null; type: StockScreenEvent["type"] | null } {
  if (previous?.closed_at) {
    if (now - Date.parse(previous.closed_at) < SCREEN_RULES.cooldown_ms) return { alert: previous, type: null };
    previous = null;
  }
  if (!previous) {
    if (screen.state !== "candidate" || !screen.metrics) return { alert: null, type: null };
    return { type: "created", alert: {
      id, policy: STOCK_SCREENER_POLICY, symbol: screen.symbol, label: screen.label, beat_id: screen.beat_id,
      version: 1, state: "active", created_at: iso(now), updated_at: iso(now), closed_at: null,
      valid_until: iso(now + SCREEN_RULES.validity_ms), expires_at: iso(now + SCREEN_RULES.lifetime_ms),
      reason: screen.reason, feed, reference: screen.metrics, latest: screen.metrics, evidence: [],
      outcomes: ([15, 60] as const).map(minutes => ({ minutes, due_at: iso(now + minutes * MINUTE), status: "pending", measured_at: null, asset_return_bps: null, relative_return_bps: null, cost_scenario_bps: null })),
    } };
  }
  const change = (state: StockAlert["state"], type: StockScreenEvent["type"], reason: string) => ({ type, alert: {
    ...previous!, state, reason, version: previous!.version + 1, updated_at: iso(now),
    closed_at: state === "expired" || state === "invalidated" ? iso(now) : null,
  } });
  if (now >= Date.parse(previous.expires_at)) return change("expired", "expired", "The setup reached its maximum lifetime.");
  if (screen.state === "data_hold" || screen.state === "warming_up") {
    return previous.state === "data_hold" ? { alert: previous, type: null } : change("data_hold", "data_hold", screen.reason);
  }
  if (screen.state !== "candidate" || !screen.metrics) return change("invalidated", "invalidated", screen.reason);
  const resumed = previous.state === "data_hold";
  return { type: resumed ? "updated" : null, alert: { ...previous, state: "active", reason: screen.reason,
    latest: screen.metrics, updated_at: iso(now), version: previous.version + (resumed ? 1 : 0),
    valid_until: iso(Math.min(now + SCREEN_RULES.validity_ms, Date.parse(previous.expires_at))),
  } };
}

export function settleStockOutcomes(alert: StockAlert, frame: StockFrame, now: number): StockAlert {
  if (frame.feed !== alert.feed) return alert;
  const asset = frame.instruments[alert.symbol], benchmark = frame.instruments.SPY;
  if (!asset?.verified || !benchmark?.verified) return alert;
  const byTime = new Map(benchmark.bars.map(b => [b.time, b]));
  return { ...alert, outcomes: alert.outcomes.map(outcome => {
    if (outcome.status !== "pending" || now < Date.parse(outcome.due_at)) return outcome;
    const due = Date.parse(outcome.due_at);
    const bar = asset.bars.filter(b => b.time + MINUTE >= due && b.time + MINUTE <= due + 2 * MINUTE && b.time + MINUTE <= now
      && (b.observed_at ?? now) <= due + 2 * MINUTE && (byTime.get(b.time)?.observed_at ?? now) <= due + 2 * MINUTE
      && [b.close, byTime.get(b.time)?.close].every(v => typeof v === "number" && Number.isFinite(v) && v > 0)
      && b.volume > 0 && byTime.get(b.time)?.volume)
      .sort((a, b) => a.time - b.time)[0];
    if (!bar) return now > due + 2 * MINUTE ? { ...outcome, status: "missing" as const } : outcome;
    const other = byTime.get(bar.time)!;
    const move = Math.log(bar.close / alert.reference.price), bm = Math.log(other.close / alert.reference.benchmark_price);
    const relative = (move - alert.reference.beta * bm) * 10_000;
    return { ...outcome, status: "observed" as const, measured_at: iso(bar.time + MINUTE), asset_return_bps: round(Math.expm1(move) * 10_000),
      relative_return_bps: round(relative), cost_scenario_bps: round(relative - SCREEN_RULES.assumed_round_trip_cost_bps - alert.reference.spread_bps) };
  }) };
}
