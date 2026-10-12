-- REVENUE SPLITS ON A CO-HOSTED EVENT (LIVE-767, ADR-1709 phase 8).
--
-- One row per Collaborator Space the Event's home Space owner has given a share of every ticket,
-- in basis points of the gross. A Collaborator is an ACCEPTED event_space_shares row
-- (lib/events/event-share.ts); the rule that a share may only name one, that the shares together
-- take at most 9500 bps (the home Space keeps the platform's top network rung), and that every payee
-- must have payouts live is enforced at set time in lib/events/revenue-splits.ts, and re-applied at
-- checkout: a Space whose share has since been revoked, or whose account is no longer ready, is
-- left out and its share stays with the home Space. The table holds the owner's intent; the money
-- path proves it again before it moves.
--
-- When the Event carries a payable share, the ticket checkout takes the Market's separate-charges
-- plan (ADR-1576): one platform charge with transfer_group, a commerce_orders row with
-- funds_flow = 'separate' and metadata.split, and commerce_order_transfers (LIVE-622) pays each
-- Space after the ticket settles. Nothing here changes those tables.
--
-- SERVICE ROLE ONLY, like event_space_shares: RLS on, no policy, explicit revoke from anon and
-- authenticated (Supabase's default privileges grant both on every new table, ADR-959). Reads and
-- writes arrive from the owner's server action and the checkout on the service-role client.
--
-- Additive and idempotent. Reversible:
--   drop table if exists public.event_revenue_splits;

create table if not exists public.event_revenue_splits (
  id          uuid        primary key default gen_random_uuid(),
  event_id    uuid        not null references public.events(id)   on delete cascade,
  -- The Collaborator Space paid this share.
  space_id    uuid        not null references public.spaces(id)   on delete cascade,
  -- Basis points of the ticket gross. 0 is never stored: a zero share is a delete.
  bps         integer     not null check (bps > 0 and bps <= 10000),
  created_by  uuid        references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint event_revenue_splits_event_space_key unique (event_id, space_id)
);

comment on table public.event_revenue_splits is
  'A Collaborator Space''s share (bps of the gross) of every ticket on a co-hosted Event (LIVE-767). Set only by the home Space owner for accepted Collaborators with payouts live; applied at checkout through the separate-charges plan and commerce_order_transfers. Service role only.';

-- FK indexes (check:fk-indexes). event_id leads the unique constraint above.
create index if not exists event_revenue_splits_space_idx
  on public.event_revenue_splits (space_id);
create index if not exists event_revenue_splits_created_by_idx
  on public.event_revenue_splits (created_by) where created_by is not null;

alter table public.event_revenue_splits enable row level security;
revoke all on table public.event_revenue_splits from anon, authenticated;
