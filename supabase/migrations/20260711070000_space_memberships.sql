-- space_memberships: MEMBERSHIPS for the Business role (ENTITY-SPACES-SYSTEM §2.5 "Memberships").
-- This is the v1 of that deep feature and the Business analog of the Practitioner's booking
-- (20260711050000_space_booking): an owner defines membership tiers, a member joins a tier, the
-- owner sees their members. Two service-role tables, scoped by space_id, isolated per Space.
--
-- v1 IS NOT BILLING. price_cents + interval are DISPLAY ONLY: joining a tier records a membership,
-- it does NOT take a payment. The join surface frames this honestly (CONTENT-VOICE skeptic test):
-- the price is what membership will cost once paid billing ships; joining registers the member now.
--
-- DEFERRED to Phase 4 (NOT modeled here): Stripe billing / dunning / proration, class packs and
-- drop-ins, member-only gating of content. Adding billing is additive (a payments table + a
-- subscription id column on space_memberships), never a refactor (P4). price_cents/interval are
-- already shaped to carry that future without a migration churn.
--
-- ACCESS MODEL (mirrors space_bookings / space_members): RLS is enabled TO authenticated with NO
-- client read/write policies at all. EVERY read + write goes through the gated server actions in
-- lib/spaces/memberships.ts using the service-role admin client (which bypasses RLS). The server is
-- the authority for "which space" and "what may this caller do here" (P5):
--   • setMembershipTiers / listSpaceMemberships are gated on canEditProfile (owner / admin / editor).
--   • listMembershipTiers returns the active tiers (public-readable via the server component).
--   • joinTier records one membership for any authenticated member; the partial unique index below
--     is the last-line guard against two active memberships for the same member in one Space.
--   • cancelMembership is allowed for the member who joined or a space admin.
--
-- House style (matches space_booking.sql): additive + idempotent, applied to production via the
-- Supabase SQL Editor; lib/database.types.ts is regenerated separately, and lib/spaces/memberships.ts
-- reaches these tables with untyped casts until then (the codebase pattern for not-yet-typed tables,
-- ADR-246). This file is the canonical record. SAFE to re-run.

-- ── space_membership_tiers: the tiers an owner publishes ───────────────────────────────────────
-- One or more named tiers per Space. price_cents + interval are DISPLAY ONLY in v1 (what the tier
-- will cost once paid billing ships; joining takes no charge). benefits is a jsonb array of plain
-- strings the join card lists. sort orders the tiers in the editor + on the join surface; is_active
-- hides a retired tier from members without deleting it (existing memberships keep their tier row).
create table if not exists public.space_membership_tiers (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references public.spaces(id) on delete cascade,
  name         text not null,
  price_cents  integer not null default 0 check (price_cents >= 0),   -- DISPLAY ONLY in v1 (no charge)
  interval     text not null default 'month'
                 check (interval in ('month', 'year', 'once')),
  description  text,
  benefits     jsonb not null default '[]',                           -- array of plain benefit strings
  sort         smallint not null default 0,
  is_active    boolean not null default true,                         -- false = retired (hidden from members)
  created_at   timestamptz not null default now()
);

comment on table public.space_membership_tiers is
  'Membership tiers a Business Space publishes (ENTITY-SPACES-SYSTEM §2.5, memberships v1). price_cents/interval are DISPLAY ONLY in v1 (joining takes no charge; Stripe billing is Phase 4). benefits is a jsonb array of plain strings. Writes are service-role only via setMembershipTiers (gated on canEditProfile).';

comment on column public.space_membership_tiers.price_cents is 'The tier price in cents, DISPLAY ONLY in v1 (what membership will cost once paid billing ships; joining takes no charge).';
comment on column public.space_membership_tiers.interval is 'Billing cadence shown to members: month, year, or once. DISPLAY ONLY in v1.';
comment on column public.space_membership_tiers.benefits is 'A jsonb array of plain benefit strings the join card lists (e.g. ["Unlimited classes", "Member events"]).';
comment on column public.space_membership_tiers.sort is 'Display order, low to high, in the editor and on the member join surface.';
comment on column public.space_membership_tiers.is_active is 'false = retired: hidden from members (listMembershipTiers), but kept so existing memberships keep their tier row.';

-- The tenant filter: every read of this table filters space_id first.
create index if not exists space_membership_tiers_space_idx on public.space_membership_tiers (space_id);

-- ── space_memberships: a member's membership in a Space's tier ──────────────────────────────────
-- One row per member-joins-tier. status 'active' holds the membership; 'cancelled' ends it (kept
-- for history rather than deleted). The partial UNIQUE index below enforces at most ONE active
-- membership per (space_id, member_profile_id): a second join while already active is rejected and
-- joinTier returns a friendly "already a member" message instead. A cancelled row does NOT block a
-- re-join.
create table if not exists public.space_memberships (
  id                 uuid primary key default gen_random_uuid(),
  space_id           uuid not null references public.spaces(id) on delete cascade,
  member_profile_id  uuid not null references public.profiles(id),
  tier_id            uuid not null references public.space_membership_tiers(id),
  status             text not null default 'active'
                       check (status in ('active', 'cancelled')),
  started_at         timestamptz not null default now(),
  created_at         timestamptz not null default now()
);

comment on table public.space_memberships is
  'A member''s membership in a Business Space tier (ENTITY-SPACES-SYSTEM §2.5, memberships v1). status active holds the membership, cancelled ends it (kept for history). A partial unique index on (space_id, member_profile_id) WHERE status=active enforces one active membership per member per Space. v1 records the membership only; no charge is taken (billing is Phase 4). Writes are service-role only via joinTier/cancelMembership in lib/spaces/memberships.ts.';

comment on column public.space_memberships.status is 'active = the membership is live; cancelled = ended (row retained for history, does not block re-joining).';
comment on column public.space_memberships.started_at is 'When the member joined (v1 records the join; no charge is taken).';

-- The tenant filter + the owner member-list scan.
create index if not exists space_memberships_space_idx on public.space_memberships (space_id);
-- "Which memberships does this member hold" (cancelMembership ownership + a member's own view).
create index if not exists space_memberships_member_idx on public.space_memberships (member_profile_id);

-- ONE-ACTIVE GUARD: at most one ACTIVE membership per (space_id, member_profile_id). A cancelled
-- row is excluded from the index, so a member who cancelled may re-join. This is the DB-level last
-- line of defense behind joinTier's server-side "already a member" pre-check.
create unique index if not exists space_memberships_one_active_per_member
  on public.space_memberships (space_id, member_profile_id)
  where status = 'active';

-- ── RLS: enabled, NO client policies (all access via the service-role admin client) ────────────
-- Exactly like space_bookings: enabling RLS with no SELECT/INSERT/UPDATE/DELETE policy denies all
-- direct client access, so the only path to these rows is the gated server actions in
-- lib/spaces/memberships.ts (the admin client bypasses RLS). This keeps the member list owner-only
-- and the tier writes server-authoritative.
alter table public.space_membership_tiers enable row level security;
alter table public.space_memberships enable row level security;
