-- THE TRANSFER LEDGER (LIVE-622, ADR-1614; PROG-D8 piece 2).
--
-- A split order (commerce_orders.funds_flow = 'separate', ADR-1576) is ONE charge on the platform
-- account carrying transfer_group = the order id. Nobody is paid by the charge itself: each seller
-- is paid by a Stripe transfer that follows it, and those N transfers are N separate API calls that
-- can each fail on their own (a connected account restricted since checkout, a network error
-- between two of them). A destination charge is atomic; this is not. So every transfer a seller is
-- owed is a ROW with its own state, written before the money moves, and the row is what a retry, a
-- reconciler, a refund (LIVE-623) and a seller's view (LIVE-624) all read.
--
--   planned   written at settle, one per seller share in commerce_orders.metadata.split
--   created   Stripe accepted the transfer; stripe_transfer_id is set
--   failed    the last attempt was refused; last_error says why, attempts says how often.
--             The reconciler (/api/cron/reconcile-transfers) retries it under the same
--             idempotency key ("transfer:" || id), so a retry can never pay a seller twice.
--   reversed  the transfer has been reversed in full (transfer.reversed from the webhook, or
--             LIVE-623's refund). A partial reversal stays 'created' with reversed_cents > 0.
--
-- One row per seller per order: unique (order_id, seller_key), where seller_key is the seam's
-- sellerKey() (kind:profile:space), so two plans of the same order write nothing twice. Two sellers
-- CAN share one connected account (a person's own listing and the Space they own), which is why the
-- key is the seller and not the account.
--
-- SERVICE ROLE ONLY, like financial_transactions: RLS on, no policy, and an explicit revoke from
-- anon and authenticated (Supabase's default privileges grant both on every new table). Every
-- write arrives from the settle, the webhook or the reconciler on the service-role client. A
-- seller's read of their own share is LIVE-624's and arrives through the server, not a policy.
--
-- Additive and idempotent. Reversible:
--   drop table if exists public.commerce_order_transfers;

create table if not exists public.commerce_order_transfers (
  id                  uuid primary key default gen_random_uuid(),
  -- A transfer outlives nothing it pays for: an order with a transfer row cannot be deleted.
  order_id            uuid not null references public.commerce_orders(id) on delete restrict,
  seller_key          text not null,
  -- The seller, as the order's metadata.split recorded it. Never the platform (it is where the
  -- charge lands, not a destination) and never 'split'.
  owner_kind          text not null check (owner_kind in ('profile', 'space')),
  owner_profile_id    uuid references public.profiles(id) on delete set null,
  owner_space_id      uuid references public.spaces(id) on delete set null,
  -- The connected account the transfer pays, as priced at checkout.
  stripe_account_id   text not null check (stripe_account_id <> ''),
  -- What the seller receives: their gross share minus their platform fee.
  amount_cents        integer not null check (amount_cents > 0),
  -- The platform fee kept from this seller's share (the platform keeps it by transferring less).
  platform_fee_cents  integer not null default 0 check (platform_fee_cents >= 0),
  currency            text not null default 'usd',
  status              text not null default 'planned'
                        check (status in ('planned', 'created', 'failed', 'reversed')),
  stripe_transfer_id  text unique,
  -- The charge the transfer draws on (source_transaction), so it can land before the funds settle.
  source_charge_id    text,
  reversed_cents      integer not null default 0,
  attempts            integer not null default 0 check (attempts >= 0),
  last_error          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint commerce_order_transfers_order_seller_key unique (order_id, seller_key),
  -- A transfer that Stripe accepted has an id; one that was only planned or refused has none.
  constraint commerce_order_transfers_created_has_id_check
    check ((status in ('created', 'reversed')) = (stripe_transfer_id is not null)),
  constraint commerce_order_transfers_reversed_cents_check
    check (reversed_cents >= 0 and reversed_cents <= amount_cents)
);

comment on table public.commerce_order_transfers is
  'One row per transfer a seller is owed on a separate-charges (split) order (LIVE-622, ADR-1614): planned at settle, created under the idempotency key transfer:<id>, failed with last_error and retried by /api/cron/reconcile-transfers, reversed from transfer.reversed or a split refund (LIVE-623). Service role only.';
comment on column public.commerce_order_transfers.seller_key is
  'sellerKey() from lib/commerce/funds-flow.ts (owner_kind:owner_profile_id:owner_space_id). With order_id it is the idempotency of the plan: one row per seller per order.';
comment on column public.commerce_order_transfers.reversed_cents is
  'Cents reversed so far, as Stripe reports amount_reversed (cumulative). Equal to amount_cents once status is reversed.';

-- FK indexes. order_id is the leading column of the unique constraint above.
create index if not exists commerce_order_transfers_owner_profile_idx
  on public.commerce_order_transfers (owner_profile_id) where owner_profile_id is not null;
create index if not exists commerce_order_transfers_owner_space_idx
  on public.commerce_order_transfers (owner_space_id) where owner_space_id is not null;
-- The reconciler's queue: the rows that have not landed, oldest touch first.
create index if not exists commerce_order_transfers_due_idx
  on public.commerce_order_transfers (updated_at) where status in ('planned', 'failed');

alter table public.commerce_order_transfers enable row level security;
revoke all on table public.commerce_order_transfers from anon, authenticated;
