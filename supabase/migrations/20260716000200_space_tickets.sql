-- space_ticket_tiers + space_ticket_rsvps: EVENT SPACE TICKETING for the event_space role (MASTER-PLAN
-- ADMIN-03, "Event Space ticketing owner control"). This is the v1 owner surface for an Event Space's
-- ticket tiers and the Event Space analog of the Business memberships tables
-- (20260711070000_space_memberships): an owner defines free / RSVP ticket tiers with a capacity, a
-- member RSVPs to a tier, the owner sees who is coming. Two service-role tables, scoped by space_id,
-- isolated per Space.
--
-- v1 IS NOT A BOX OFFICE. There is NO money: a tier is either FREE (open entry) or RSVP (a member
-- reserves a spot). No price column exists, on purpose, so nothing can imply a charge. Capacity caps
-- how many spots a tier holds (NULL = unlimited). The surfaces frame this honestly (CONTENT-VOICE
-- skeptic test): reserving a spot records an RSVP, it does NOT take a payment.
--
-- DEFERRED to the Held Phase 4 (NOT modeled here): Stripe Connect, real paid ticketing, tax receipts,
-- installments, a box office. Adding paid tickets later is additive (a price_cents column + a payments
-- table + a paid `kind`), never a refactor (P4). The `kind` CHECK already carries 'free'/'rsvp' and a
-- future 'paid' value is a one-line CHECK widen, not a table rebuild.
--
-- ACCESS MODEL (mirrors space_memberships / space_bookings / space_members): RLS is enabled with NO
-- client read/write policies at all. EVERY read + write goes through the gated server helpers in
-- lib/spaces/tickets.ts using the service-role admin client (which bypasses RLS). The server is the
-- authority for "which space" and "what may this caller do here" (P5, ADR-331/334/338):
--   • setTicketTiers / listSpaceRsvps are gated on canEditProfile (owner / admin / editor).
--   • listTicketTiers returns the active tiers (public-readable via the server component).
--   • rsvpToTier records one RSVP for any authenticated member; the partial unique index below is the
--     last-line guard against two active RSVPs for the same member on one tier.
--   • cancelRsvp is allowed for the member who reserved or a space admin.
--
-- House style (matches space_memberships.sql): additive + idempotent, applied to production via the
-- Supabase SQL Editor; lib/database.types.ts is regenerated separately, and lib/spaces/tickets.ts
-- reaches these tables with untyped casts until then (the codebase pattern for not-yet-typed tables,
-- ADR-246). This file is the canonical record. SAFE to re-run.

-- ── space_ticket_tiers: the ticket tiers an Event Space owner publishes ─────────────────────────
-- One or more named tiers per Space. kind is 'free' (open entry, no reservation needed beyond the
-- door) or 'rsvp' (a member reserves a spot, capacity-limited). capacity caps the spots a tier holds
-- (NULL = unlimited). description is a plain line or two the ticket card shows. sort orders the tiers
-- in the editor + on the member surface; is_active hides a retired tier from members without deleting
-- it (existing RSVPs keep their tier row). NO price column exists in v1 (no money, ADMIN-03).
create table if not exists public.space_ticket_tiers (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references public.spaces(id) on delete cascade,
  name         text not null,
  kind         text not null default 'free'
                 check (kind in ('free', 'rsvp')),                   -- NO 'paid' in v1 (no money, ADMIN-03)
  capacity     integer check (capacity is null or capacity >= 0),    -- NULL = unlimited spots
  description  text,
  sort         smallint not null default 0,
  is_active    boolean not null default true,                        -- false = retired (hidden from members)
  created_at   timestamptz not null default now()
);

comment on table public.space_ticket_tiers is
  'Ticket tiers an Event Space publishes (MASTER-PLAN ADMIN-03, ticketing v1). NO money: kind is free or rsvp only (real paid ticketing is the Held Phase 4). capacity caps the spots (NULL = unlimited). Writes are service-role only via setTicketTiers in lib/spaces/tickets.ts (gated on canEditProfile).';

comment on column public.space_ticket_tiers.kind is 'free = open entry (no reservation); rsvp = a member reserves a spot (capacity-limited). NO paid value in v1 (no money; real paid ticketing is the Held Phase 4).';
comment on column public.space_ticket_tiers.capacity is 'How many spots the tier holds. NULL = unlimited. For an rsvp tier this caps active RSVPs.';
comment on column public.space_ticket_tiers.description is 'A plain line or two the ticket card shows (what this tier is, what it includes).';
comment on column public.space_ticket_tiers.sort is 'Display order, low to high, in the editor and on the member ticket surface.';
comment on column public.space_ticket_tiers.is_active is 'false = retired: hidden from members (listTicketTiers), but kept so existing RSVPs keep their tier row.';

-- The tenant filter: every read of this table filters space_id first.
create index if not exists space_ticket_tiers_space_idx on public.space_ticket_tiers (space_id);

-- ── space_ticket_rsvps: a member's RSVP to a Space's ticket tier ─────────────────────────────────
-- One row per member-reserves-tier. status 'going' holds the RSVP; 'cancelled' ends it (kept for
-- history rather than deleted). The partial UNIQUE index below enforces at most ONE going RSVP per
-- (tier_id, member_profile_id): a second RSVP to the same tier while already going is rejected and
-- rsvpToTier returns a friendly "already reserved" message instead. A cancelled row does NOT block a
-- re-RSVP. v1 records the RSVP only; NO charge is taken (no money, ADMIN-03).
create table if not exists public.space_ticket_rsvps (
  id                 uuid primary key default gen_random_uuid(),
  space_id           uuid not null references public.spaces(id) on delete cascade,
  tier_id            uuid not null references public.space_ticket_tiers(id) on delete cascade,
  member_profile_id  uuid not null references public.profiles(id),
  status             text not null default 'going'
                       check (status in ('going', 'cancelled')),
  reserved_at        timestamptz not null default now(),
  created_at         timestamptz not null default now()
);

comment on table public.space_ticket_rsvps is
  'A member''s RSVP to an Event Space ticket tier (MASTER-PLAN ADMIN-03, ticketing v1). status going holds the RSVP, cancelled ends it (kept for history). A partial unique index on (tier_id, member_profile_id) WHERE status=going enforces one going RSVP per member per tier. v1 records the RSVP only; NO charge is taken (no money; real paid ticketing is the Held Phase 4). Writes are service-role only via rsvpToTier/cancelRsvp in lib/spaces/tickets.ts.';

comment on column public.space_ticket_rsvps.status is 'going = the RSVP is live; cancelled = ended (row retained for history, does not block re-RSVP).';
comment on column public.space_ticket_rsvps.reserved_at is 'When the member reserved (v1 records the RSVP; no charge is taken).';

-- The tenant filter + the owner RSVP-list scan.
create index if not exists space_ticket_rsvps_space_idx on public.space_ticket_rsvps (space_id);
-- "Which RSVPs are on this tier" (capacity counts + the owner per-tier view).
create index if not exists space_ticket_rsvps_tier_idx on public.space_ticket_rsvps (tier_id);
-- "Which RSVPs does this member hold" (cancelRsvp ownership + a member's own view).
create index if not exists space_ticket_rsvps_member_idx on public.space_ticket_rsvps (member_profile_id);

-- ONE-GOING GUARD: at most one GOING RSVP per (tier_id, member_profile_id). A cancelled row is
-- excluded from the index, so a member who cancelled may re-RSVP. This is the DB-level last line of
-- defense behind rsvpToTier's server-side "already reserved" pre-check.
create unique index if not exists space_ticket_rsvps_one_going_per_member
  on public.space_ticket_rsvps (tier_id, member_profile_id)
  where status = 'going';

-- ── RLS: enabled, NO client policies (all access via the service-role admin client) ─────────────
-- Exactly like space_memberships / space_bookings: enabling RLS with no SELECT/INSERT/UPDATE/DELETE
-- policy denies all direct client access, so the only path to these rows is the gated server helpers
-- in lib/spaces/tickets.ts (the admin client bypasses RLS). This keeps the RSVP list owner-only and
-- the tier writes server-authoritative.
alter table public.space_ticket_tiers enable row level security;
alter table public.space_ticket_rsvps enable row level security;
