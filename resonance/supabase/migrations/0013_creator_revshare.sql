-- 0013_creator_revshare — creator economy / revenue share (spec §17).
--
-- Isolation (docs/ISOLATION.md): everything lives in `resonance`; FKs only ever
-- point WITHIN this schema. User/world ids are plain uuid with NO cross-schema FK.
--
-- Economy: market items can have a creator. When someone buys an item with Zaps,
-- a share of those Zaps is credited to the creator (via the existing zaps_ledger
-- `reward` path) and recorded here as an earnings ledger row. Earnings accrue in
-- Zaps. NOTE: fiat payout (Stripe Connect) is a deliberate FUTURE step; for now
-- earnings are tracked in Zaps only.

-- The item's creator. Nullable: house/seed items stay null and pay no one.
alter table resonance.market_items
  add column if not exists created_by uuid;

-- Append-only earnings ledger. One row per credited purchase. amount_zaps is the
-- creator's share of the buyer's spend (see lib/creator CREATOR_SHARE).
create table if not exists resonance.creator_earnings (
  id              uuid primary key default gen_random_uuid(),
  world_id        uuid not null,
  creator_user_id uuid not null,                 -- external id; no cross-schema FK
  item_id         uuid references resonance.market_items(id) on delete set null,
  buyer_user_id   uuid not null,                 -- external id; no cross-schema FK
  amount_zaps     integer not null,
  created_at      timestamptz not null default now()
);

comment on table resonance.creator_earnings is
  'Per-purchase creator revenue share, accrued in Zaps. Fiat payout (Stripe '
  'Connect) is a future step; for now earnings are tracked in Zaps only.';

create index if not exists creator_earnings_by_creator
  on resonance.creator_earnings (world_id, creator_user_id);

-- Service-role only, matching 0003: RLS on with no policies (the data layer is
-- server-only by design; RLS is the backstop).
alter table resonance.creator_earnings enable row level security;
