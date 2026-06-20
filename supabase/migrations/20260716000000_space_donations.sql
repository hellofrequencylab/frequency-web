-- space_donation_asks: DONATION ASKS for the Organization role (ENTITY-SPACES-SYSTEM §2.6 "Donate",
-- MASTER-PLAN item ADMIN-01). This is the v1 of that owner control and the Organization analog of the
-- Business's membership tiers (20260711070000_space_memberships) and the Practitioner's booking
-- (20260711050000_space_booking): an organization owner configures hosted donation asks (a fund
-- label, a short description, and a set of suggested amounts) that the member-facing Donate CTA reads.
-- One service-role table, scoped by space_id, isolated per Space.
--
-- v1 IS NOT MONEY. amount_cents (the suggested amounts) and the fund label / description are DISPLAY
-- ONLY: nothing here takes a payment, and there is no Stripe path. The owner editor and the member
-- surface frame this honestly (CONTENT-VOICE skeptic test): the amounts are what an owner SUGGESTS,
-- and giving is not yet wired. Real charges + tax receipts are Phase 4 and deliberately NOT modeled
-- here (additive later: a payments table + a charge id column, never a refactor, P4).
--
-- ONE ROW PER SPACE: a Space has at most ONE donation-ask configuration (its fund). The partial-free
-- unique index on space_id enforces that, so saving is an upsert-by-space (setDonationAsk replaces
-- the single row). suggested_amounts_cents is a jsonb array of plain integer cent amounts the Donate
-- card renders as quick-pick chips.
--
-- ACCESS MODEL (mirrors space_memberships / space_bookings / space_members): RLS is enabled TO
-- authenticated with NO client read/write policies at all. EVERY read + write goes through the gated
-- server actions in lib/spaces/donations.ts using the service-role admin client (which bypasses RLS).
-- The server is the authority for "which space" and "what may this caller do here" (P5):
--   • setDonationAsk is gated on canEditProfile (owner / admin / editor); the staff (janitor) preview
--     is READ-ONLY (writes re-check canEditProfile, so a staff viewer never writes).
--   • getDonationAsk returns the active ask for the member-facing Donate surface (public-readable via
--     the server component).
--   • getOwnerDonationAsk returns the ask for the owner editor (gated on canEditProfile OR a janitor
--     previewing as staff), so the editor can read its current configuration back.
--
-- House style (matches space_memberships.sql): additive + idempotent, applied to production via the
-- Supabase SQL Editor by the integrator; lib/database.types.ts is regenerated separately, and
-- lib/spaces/donations.ts reaches this table with untyped casts until then (the codebase pattern for
-- not-yet-typed tables, ADR-246). This file is the canonical record. SAFE to re-run.

-- ── space_donation_asks: the donation ask an Organization owner publishes ───────────────────────
-- At most one row per Space (its fund). fund_label names the fund the Donate card shows; description
-- is a short plain blurb; suggested_amounts_cents is a jsonb array of integer cent amounts (the
-- quick-pick chips). is_active hides the ask from members without deleting it. All DISPLAY ONLY in
-- v1: no charge is taken, and there is no payment path (Stripe is Phase 4).
create table if not exists public.space_donation_asks (
  id                       uuid primary key default gen_random_uuid(),
  space_id                 uuid not null references public.spaces(id) on delete cascade,
  fund_label               text not null,
  description              text,
  suggested_amounts_cents  jsonb not null default '[]',   -- array of integer cent amounts, DISPLAY ONLY (no charge)
  is_active                boolean not null default true,  -- false = the ask is hidden from members
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table public.space_donation_asks is
  'The donation ask an Organization Space publishes (ENTITY-SPACES-SYSTEM §2.6, donations v1; MASTER-PLAN ADMIN-01). fund_label / description / suggested_amounts_cents are DISPLAY ONLY in v1 (no charge is taken; there is no Stripe path; real charges + tax receipts are Phase 4). At most one row per Space (a partial-free unique index on space_id). Writes are service-role only via setDonationAsk (gated on canEditProfile).';

comment on column public.space_donation_asks.fund_label is 'The fund name the Donate card shows (e.g. "General fund"). DISPLAY ONLY in v1.';
comment on column public.space_donation_asks.description is 'A short plain blurb describing where gifts go. DISPLAY ONLY in v1.';
comment on column public.space_donation_asks.suggested_amounts_cents is 'A jsonb array of integer cent amounts the Donate card renders as quick-pick chips (e.g. [2500, 5000, 10000]). DISPLAY ONLY in v1 (no charge is taken).';
comment on column public.space_donation_asks.is_active is 'false = the ask is hidden from members (getDonationAsk returns null), but kept so re-enabling restores it.';

-- The tenant filter: every read of this table filters space_id first. ALSO the upsert key: at most
-- ONE donation ask per Space, so the owner editor saves a single row (replace-by-space).
create unique index if not exists space_donation_asks_space_idx
  on public.space_donation_asks (space_id);

-- ── RLS: enabled, NO client policies (all access via the service-role admin client) ─────────────
-- Exactly like space_memberships / space_bookings: enabling RLS with no SELECT/INSERT/UPDATE/DELETE
-- policy denies all direct client access, so the only path to these rows is the gated server actions
-- in lib/spaces/donations.ts (the admin client bypasses RLS). This keeps the ask owner-authoritative
-- on write while the active ask stays readable by the member-facing server component.
alter table public.space_donation_asks enable row level security;
