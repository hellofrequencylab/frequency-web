-- THE TRANSFER EACH SELLER IS OWED (LIVE-622, ADR-1636; PROG-D8 piece 2).
--
-- A destination charge is atomic: the money splits as it lands. A SEPARATE order (LIVE-621) is
-- not. The charge sits on the platform, and paying each seller is N follow-up Stripe transfers
-- that each fail on their own (a connected account restricted since checkout, a balance not yet
-- available, a network error between two of the N). The state of each intended transfer has to
-- be a row of its own, and something has to go back for the ones that did not land.
--
-- This table is that ledger. One row per seller of a separate order, written at settle, created
-- against the charge under an idempotency key, retried by /api/cron/reconcile-transfers, and
-- marked reversed when Stripe says the transfer was reversed (dashboard or LIVE-623).
-- A destination order never gets a row: its split is the charge.
--
-- Versioned 20270345009800, not the 9610 the row named: 9600-9649 is the D7 lane's range, and
-- 9700 is the funds-flow column this ledger stands on.
-- Service-role only: RLS on, no member policy, grants revoked from anon and authenticated,
-- matching financial_transactions. Idempotent. Reversible:
--   drop table if exists public.commerce_order_transfers;

create table if not exists public.commerce_order_transfers (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references public.commerce_orders(id) on delete restrict,
  owner_kind           text not null check (owner_kind in ('profile', 'space')),
  owner_profile_id     uuid references public.profiles(id) on delete restrict,
  owner_space_id       uuid references public.spaces(id) on delete restrict,
  stripe_account_id    text not null,
  amount_cents         integer not null check (amount_cents > 0),
  platform_fee_cents   integer not null default 0 check (platform_fee_cents >= 0),
  currency             text not null default 'usd',
  status               text not null default 'planned'
                         check (status in ('planned', 'created', 'failed', 'reversed')),
  stripe_transfer_id   text unique,
  reversed_cents       integer not null default 0 check (reversed_cents >= 0),
  attempts             integer not null default 0 check (attempts >= 0),
  last_error           text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (order_id, stripe_account_id)
);

comment on table public.commerce_order_transfers is
  'One intended Stripe transfer per seller of a separate-charges commerce order (LIVE-622, ADR-1636). planned = owed and not yet sent; created = Stripe accepted it; failed = the create threw and the reconciler will retry; reversed = Stripe reports the transfer was reversed. A destination-charge order never has a row. Service-role only.';

create index if not exists commerce_order_transfers_order_idx
  on public.commerce_order_transfers (order_id);

create index if not exists commerce_order_transfers_due_idx
  on public.commerce_order_transfers (updated_at)
  where status in ('planned', 'failed');

alter table public.commerce_order_transfers enable row level security;

revoke all on table public.commerce_order_transfers from anon, authenticated;
