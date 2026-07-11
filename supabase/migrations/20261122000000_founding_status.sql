-- ============================================================================
-- FOUNDING STATUS: the durable, grandfathered record that a member or a Space is
-- a Founder at a LOCKED rate (the Founders Round + the Founding Businesses cohort,
-- Beta Command Center P2/P4). ONE table, service-role only.
-- ============================================================================
--
-- WHY A TABLE (not just profiles.is_founding_member): the existing boolean flag
-- (profiles.is_founding_member) records "this member bought the one-time Founders
-- Round" and is enough for a member. The COHORT needs more: a Founding Business
-- locks an ANNUAL rate and a bought-down take-rate against a per-CITY cap, a
-- reservation exists BEFORE anyone is charged, and the whole thing must survive
-- the September 1 billing graduation as a permanent grandfathered grant. That is a
-- durable relationship, not a flag, so it gets its own row.
--
-- RESERVE-NOW, CHARGE-AT-GRADUATION (the no-charge invariant): a row is created at
-- RESERVE time with status='reserved' and charged_at=NULL. NOTHING is charged on
-- reserve (card_on_file stays false; a card is optional and, when collected later,
-- is only charged once billing is live). grantFoundingStatus() (lib/founding/
-- status.ts), called by the beta graduation, flips reserved -> active and applies
-- the locked rate. It NEVER charges: the money flip lives behind billingLive() /
-- payoutsLive() and is owned by the billing path, not this record.
--
-- ── ACCESS MODEL: SERVICE-ROLE ONLY (mirrors business_intake / beta_* ) ──
-- RLS is ENABLED with NO client policies, so the ONLY access path is the gated
-- server code (lib/founding/*, the service-role admin client) behind app-layer
-- authz. The public charter badge reads this table through that same admin client
-- (like lib/commerce/seller-verification.ts reads verification), never directly
-- from a browser. RLS-on-no-policy denies all anon/authed access (fail-closed);
-- the deliberate posture is registered in scripts/rls-deny-all.txt.
--
-- House style (matches business_intake.sql / beta_command_center.sql): additive +
-- idempotent, SAFE to re-run. Applied to production separately (do NOT apply from a
-- worktree); lib/database.types.ts is regenerated separately and the seam reaches
-- this table with untyped casts until then (ADR-246). No em or en dashes in copy.
-- ============================================================================

create table if not exists public.founding_members (
  id                uuid primary key default gen_random_uuid(),

  -- WHO holds the founding status. A member founder carries a profile_id; a
  -- Founding Business carries a space_id (and usually the owner's profile_id too).
  -- At least one must be set (the check below). Both cascade so a deleted member /
  -- Space takes its founding row with it.
  profile_id        uuid references public.profiles(id) on delete cascade,
  space_id          uuid references public.spaces(id) on delete cascade,

  -- 'member'   = an individual Founding Member (the Founders Round).
  -- 'business' = a Founding Business (the per-city fee-buydown cohort).
  -- Free-text + check (not a pg enum) so a new kind needs no type migration.
  kind              text not null default 'member'
                    check (kind in ('member', 'business')),

  -- THE LOCKED RATE, grandfathered for life. locked_rate_cents is the one-time
  -- member rate OR the Founding Business MONTHLY rate (per kind). locked_take_bps
  -- is the bought-down marketplace take-rate for a Founding Business (300 = 3%,
  -- vs the 5-8% standard ladder). Either may be null when it does not apply.
  locked_rate_cents integer,
  locked_take_bps   integer,

  -- The city this founder counts against (the per-city Founding Business cap is
  -- computed over this column). Free-text; a member founder may leave it null.
  cohort_city       text,

  -- THE LIFECYCLE. reserved -> active (at graduation) -> lapsed (if a founder ever
  -- falls out). reserved_at is set on reserve; charged_at stays NULL until billing
  -- actually charges (after the Sept 1 flip), so a non-null charged_at is the proof
  -- money moved. Free-text + check.
  reserved_at       timestamptz not null default now(),
  charged_at        timestamptz,
  status            text not null default 'reserved'
                    check (status in ('reserved', 'active', 'lapsed')),

  -- Whether a card was collected at reserve (OPTIONAL, and never charged on reserve).
  -- Stays false in waitlist mode; a later card-capture step may set it true, but the
  -- charge still waits for billingLive().
  card_on_file      boolean not null default false,

  -- Free-form extras (source page, reserved tier, contact email for an anonymous
  -- reservation, etc.) so a new field needs no column.
  meta              jsonb not null default '{}'::jsonb,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- A founding row must belong to a member OR a Space (or both). A row with neither
  -- is meaningless and is rejected.
  constraint founding_members_subject_present
    check (profile_id is not null or space_id is not null)
);

-- IDEMPOTENCY / ONE-PER-SUBJECT: at most one founding row per member and per Space,
-- so reserve + grant are upsert-safe and re-running never duplicates a founder.
create unique index if not exists founding_members_profile_uidx
  on public.founding_members (profile_id) where profile_id is not null;
create unique index if not exists founding_members_space_uidx
  on public.founding_members (space_id) where space_id is not null;

-- Hot reads: the grant sweep lists reserved rows by kind; the badge resolver reads
-- active rows; the per-city cap counts non-lapsed business rows in a city.
create index if not exists founding_members_status_idx
  on public.founding_members (status, kind);
create index if not exists founding_members_city_idx
  on public.founding_members (cohort_city, kind) where status <> 'lapsed';

-- FAIL-CLOSED: RLS enabled, NO policies. Service-role (admin client) only. Reached
-- via lib/founding/* behind app-layer authz; registered in scripts/rls-deny-all.txt.
alter table public.founding_members enable row level security;

comment on table public.founding_members is
  'Durable, grandfathered Founder record for the Founders Round (members) and the Founding Businesses cohort. One row per member/Space, carrying the LOCKED rate (rate_cents + take_bps), cohort city, and the reserved->active->lapsed lifecycle. Reserve-now-charge-at-graduation: a row is reserved with charged_at NULL and NOTHING is charged until billingLive(); grantFoundingStatus() (lib/founding/status.ts) flips reserved->active and applies the locked rate without charging. Service-role only, fail-closed: RLS ENABLED with NO policies; the only access path is the gated server code in lib/founding/* (admin client). The public charter badge reads through that same admin client, never directly from a browser.';
comment on column public.founding_members.charged_at is
  'NULL until billing actually charges this founder (after the Sept 1 billing_live flip). A non-null value is the proof money moved. grantFoundingStatus() does NOT set this (it never charges); the gated billing path does.';
comment on column public.founding_members.locked_take_bps is
  'The bought-down marketplace take-rate a Founding Business is grandfathered into, in basis points (300 = 3%, vs the 5-8% standard ladder). NULL for a member founder.';
