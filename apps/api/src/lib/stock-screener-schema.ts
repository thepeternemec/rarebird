/** Applied by the authorized worker only. Public reads never initialize storage. */
export const STOCK_SCREENER_SCHEMA = `
create table if not exists public.rarebird_stock_worker (
  id text primary key, lease_token text, lease_until timestamptz,
  last_scan_at timestamptz, last_error text, snapshot jsonb
);
create table if not exists public.rarebird_stock_bars (
  feed text not null, symbol text not null, started_at timestamptz not null,
  observed_at timestamptz not null, bar jsonb not null,
  primary key(feed,symbol,started_at)
);
create table if not exists public.rarebird_stock_alerts (
  id text primary key, policy text not null, feed text not null, symbol text not null,
  created_at timestamptz not null, closed_at timestamptz, next_due_at timestamptz, record jsonb not null
);
create unique index if not exists rarebird_stock_open_idx on public.rarebird_stock_alerts(policy,feed,symbol) where closed_at is null;
create index if not exists rarebird_stock_recent_idx on public.rarebird_stock_alerts(policy,feed,created_at desc);
create index if not exists rarebird_stock_due_idx on public.rarebird_stock_alerts(next_due_at) where next_due_at is not null;
create table if not exists public.rarebird_stock_events (
  sequence bigserial primary key, id text not null unique,
  alert_id text not null, version integer not null, policy text not null, feed text not null,
  recorded_at timestamptz not null, payload jsonb not null, unique(alert_id,version)
);
create index if not exists rarebird_stock_events_replay_idx on public.rarebird_stock_events(policy,feed,sequence);
create table if not exists public.rarebird_stock_outbox (
  event_id text primary key references public.rarebird_stock_events(id) on delete cascade,
  destination_hash text not null, status text not null default 'pending' check(status in ('pending','delivered','failed','skipped')),
  attempts integer not null default 0, next_attempt_at timestamptz not null,
  lease_token text, lease_until timestamptz, delivered_at timestamptz
);
create index if not exists rarebird_stock_delivery_idx on public.rarebird_stock_outbox(next_attempt_at) where status='pending';
create table if not exists public.rarebird_stock_predictions (
  alert_id text primary key references public.rarebird_stock_alerts(id) on delete cascade,
  prediction jsonb not null
);
`;
