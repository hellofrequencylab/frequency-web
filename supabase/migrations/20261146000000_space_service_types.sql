-- Booking ladder P1 (ADR-605, docs/BOOKING-PLAN.md §P1): SERVICE TYPES + DURATIONS. The Calendly
-- "event type" for a Space: reusable bookable offerings ("30 minute intro", "60 minute session"),
-- each its own template with a name, description, and duration. A member picks a service first, then
-- a time; the pure slot generator (lib/spaces/booking.ts) slices each availability window by the
-- CHOSEN service's duration instead of the window's flat slot_minutes.
--
-- FREE-PATH SOURCE OF TRUTH is THIS table, never commerce_products (which is payment-first and dark).
-- price_cents / deposit_cents / cancellation_fee_cents are display-and-config only until payments turn
-- on (P4); product_id links a commerce service product for the deposit path (set in P4, ADR-596),
-- so booking is never blocked on the commerce spine being live.
--
-- ACCESS MODEL: mirrors space_availability / space_bookings (20260711050000). RLS enabled with NO
-- client policies at all; EVERY read + write goes through the gated server actions in
-- lib/spaces/booking.ts using the service-role admin client (which bypasses RLS). The server is the
-- authority for "which space" and "what may this caller do here": writes are gated on canEditProfile.
--
-- House style (matches space_booking.sql): additive + idempotent (IF NOT EXISTS throughout), applied
-- to production separately; lib/database.types.ts is regenerated later, and lib/spaces/booking.ts
-- reaches these with untyped casts until then (ADR-246). Code is FAIL-SOFT when this table / the new
-- column is absent, so the app runs correctly with this migration UNAPPLIED. SAFE to re-run.

-- ── space_service_types: a Space's reusable bookable offerings ─────────────────────────────────
create table if not exists public.space_service_types (
  id                    uuid primary key default gen_random_uuid(),
  space_id              uuid not null references public.spaces(id) on delete cascade,
  name                  text not null,
  description           text,
  duration_minutes      smallint not null default 30 check (duration_minutes between 5 and 480),
  price_cents           integer check (price_cents is null or price_cents >= 0),      -- null = free / display-only
  active                boolean not null default true,
  sort_order            smallint not null default 0,
  -- P4 (dark) link + config: set product_id to a commerce service product so a PAID service opens the
  -- deposit-at-booking path; a free service (product_id null) keeps the P0 confirm-only path untouched.
  -- deposit_cents / cancellation_fee_cents are per-service money config read only once payments are live
  -- and double-gated on (canTakePayments AND payoutsLive), so they no-op until an owner turns payments on.
  product_id            uuid references public.commerce_products(id) on delete set null,
  deposit_cents         integer check (deposit_cents is null or deposit_cents >= 0),  -- P4: deposit vs full
  cancellation_fee_cents integer check (cancellation_fee_cents is null or cancellation_fee_cents >= 0), -- P4
  created_at            timestamptz not null default now()
);

comment on table public.space_service_types is
  'Reusable bookable offerings (service types) for a Space (ADR-605 booking ladder P1). The booking-native "event type": name + description + duration_minutes carry the FREE path; price_cents/deposit_cents/cancellation_fee_cents + product_id are display/config for the P4 deposit path (dark until payments turn on). The slot generator in lib/spaces/booking.ts slices availability windows by the chosen service duration. Writes are service-role only via setSpaceServiceTypes (gated on canEditProfile).';
comment on column public.space_service_types.duration_minutes is 'Session length; the slot generator slices each window by this instead of the window slot_minutes.';
comment on column public.space_service_types.price_cents is 'Display-only price (null = free) until P4 payments; the free booking path never charges.';
comment on column public.space_service_types.product_id is 'P4 (dark): link to a commerce_products service so a paid service opens deposit checkout. Null keeps the free confirm-only path.';

-- The tenant filter + the active-first, sorted read the member picker uses.
create index if not exists space_service_types_space_idx
  on public.space_service_types (space_id, active, sort_order);

-- ── space_availability.service_type_id: optionally bind a window to one service ────────────────
-- A NULL window offers every active service (the simple case: one window set, many durations). A SET
-- window offers ONLY that service, so an owner can carve specific hours for a specific offering.
alter table public.space_availability
  add column if not exists service_type_id uuid references public.space_service_types(id) on delete cascade;

comment on column public.space_availability.service_type_id is
  'Optional bind to a space_service_types row: null = this window offers every active service; set = only that service. (ADR-605 booking ladder P1).';

create index if not exists space_availability_service_type_idx
  on public.space_availability (service_type_id) where service_type_id is not null;

-- ── RLS: enabled, NO client policies (all access via the service-role admin client) ────────────
alter table public.space_service_types enable row level security;
