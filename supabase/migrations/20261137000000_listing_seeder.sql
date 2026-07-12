-- ============================================================================
-- CLASSIFIEDS & HOUSING SEEDER (Phase 0) — the data spine.
--
-- An operator pastes raw listing copy + photos; an AI extracts the structured
-- fields (lib/listing-seeder/extract.ts); the coerced draft is staged on a
-- listing_intake row; on publish it materializes as a listing OWNED BY the
-- Frequency seed account, carrying an EVENTS-STYLE CLAIM TOKEN so the original
-- poster can sign up and take ownership (lib/listing-seeder/claim.ts).
--
-- Two parts, both additive + idempotent (SAFE to re-run):
--   1. listing_intake      - one draft-staging row per paste (mirrors business_intake:
--                            service-role only, RLS ENABLED with NO policies).
--   2. claim columns        - claim_token / claimed_by / claimed_at on BOTH
--                            market_listings (Classifieds) and listings (Housing), so
--                            either vertical is claimable. This MIRRORS the events claim
--                            mechanism (supabase/migrations/20260613130000_poster_events.sql):
--                            events stores claim state as columns ON the events table (no
--                            separate table), with a partial-unique claim_token; we copy
--                            that shape onto the two listing tables. The only adaptation:
--                            the owner column differs per table (author_id vs
--                            owner_profile_id), and we add an explicit claimed_by (events
--                            only flipped host_id + stamped claimed_at); claimed_by records
--                            WHO claimed, for audit + the claim page.
--
-- House style (matches business_intake / poster_events): additive + idempotent,
-- lib/database.types.ts is regenerated separately and the seam reaches these with
-- untyped casts until then (ADR-246). No em or en dashes in any copy here.
--
-- ROLLBACK (manual, if ever needed):
--   drop table if exists public.listing_intake;
--   alter table public.market_listings
--     drop column if exists claim_token,
--     drop column if exists claimed_by,
--     drop column if exists claimed_at;
--   alter table public.listings
--     drop column if exists claim_token,
--     drop column if exists claimed_by,
--     drop column if exists claimed_at;
--   drop index if exists market_listings_claim_token_uniq;
--   drop index if exists listings_claim_token_uniq;
-- ============================================================================

-- ── 1. listing_intake: the draft-staging row (mirrors business_intake) ───────────

create table if not exists public.listing_intake (
  id                 uuid primary key default gen_random_uuid(),

  -- Which seeder vertical this paste is for. Classifieds -> market_listings;
  -- housing -> listings + housing_listings.
  kind               text not null check (kind in ('classifieds','housing')),

  -- ListingIntakeInputs: the raw pasted block, operator photo uploads, and hints.
  inputs             jsonb not null default '{}'::jsonb,

  -- The coerced ListingDraft (a discriminated union by kind) the publish path consumes.
  draft              jsonb not null default '{}'::jsonb,

  -- ProvenanceLedger: Record<fieldPath, LedgerEntry[]> where each entry carries
  -- { snippet, confidence, kind: fact|inferred|generated }. The spine of the grounding
  -- gate: a price/contact that is not cited is downgraded, never silently trusted.
  ledger             jsonb not null default '{}'::jsonb,

  -- The pipeline status machine (mirrors business_intake): intake -> researching ->
  -- review -> applied, with failed as a recoverable side-state. Code-gated to this set.
  status             text not null default 'intake'
                       check (status in ('intake','researching','review','applied','failed')),

  -- The materialized listing (market_listings.id OR listings.id per kind). NULL until
  -- Apply publishes it. Un-typed (no FK) because it points at one of two tables by kind.
  applied_listing_id uuid,

  -- The operator who started this paste (getMyProfileId at intake).
  created_by         uuid references public.profiles(id) on delete set null,

  error              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Hot reads: the operator review board lists rows by status, newest first.
create index if not exists listing_intake_status_idx
  on public.listing_intake (status, created_at desc);

-- Reverse lookup: from a published listing back to the intake that seeded it.
create index if not exists listing_intake_applied_idx
  on public.listing_intake (applied_listing_id);

-- FAIL-CLOSED: RLS enabled, NO policies. Only the gated server code (service-role admin
-- client, lib/listing-seeder/*) may touch this table. An intake row can hold un-verified
-- third-party contact details from a paste, so it must never be world- or member-readable.
-- The deliberate service-role-only posture is recorded in scripts/rls-deny-all.txt.
alter table public.listing_intake enable row level security;

comment on table public.listing_intake is
  'Draft-staging record for the Classifieds & Housing Seeder (Phase 0). One row per pasted listing, holding inputs + the coerced draft + a per-field provenance ledger, so nothing publishes until Apply. Service-role only, fail-closed: RLS ENABLED with NO policies; the only access path is the gated server code in lib/listing-seeder/* (admin client). Mirrors business_intake.';

-- ── 2. Claim columns on the two listing tables (mirror events claim) ─────────────

-- market_listings (Classifieds). owner column = author_id.
alter table public.market_listings
  add column if not exists claim_token text,
  add column if not exists claimed_by  uuid references public.profiles(id) on delete set null,
  add column if not exists claimed_at  timestamptz;

-- claim_token is a one-time handshake secret: at most one live listing per token, and
-- the partial predicate lets the many nulls (non-seeded listings) coexist. Mirrors
-- events_claim_token_uniq.
create unique index if not exists market_listings_claim_token_uniq
  on public.market_listings (claim_token)
  where claim_token is not null;

comment on column public.market_listings.claim_token is
  'One-time url-safe claim secret for a seeded (Frequency-owned) listing. Nulled on claim. Mirrors events.claim_token.';

-- listings (Housing). owner column = owner_profile_id.
alter table public.listings
  add column if not exists claim_token text,
  add column if not exists claimed_by  uuid references public.profiles(id) on delete set null,
  add column if not exists claimed_at  timestamptz;

create unique index if not exists listings_claim_token_uniq
  on public.listings (claim_token)
  where claim_token is not null;

comment on column public.listings.claim_token is
  'One-time url-safe claim secret for a seeded (Frequency-owned) housing listing. Nulled on claim. Mirrors events.claim_token.';
