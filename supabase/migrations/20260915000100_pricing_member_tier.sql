-- Pricing & Value Ladder, Phase A keystone (ADR-458, docs/PRICING-LADDER-PLAN.md §1/§4).
-- Member tier collapse: profiles.membership_tier collapses from free / crew / supporter to free / crew.
-- Supporter is retired AS A TIER and becomes a pay-what-you-want "Supporter" badge on Crew
-- (profiles.is_supporter). This migration is ACCESS-PRESERVING: Supporter sat ABOVE Crew (both paid,
-- both cash in, both get full gamification), so remapping supporter -> crew never reduces a member's
-- access; it only renames the tier they sit on and lights the PWYW badge.
--
-- WHY IT IS SAFE REGARDLESS. Everything ships behind `billing_live` OFF. While OFF, the entitlement
-- gates short-circuit to grant-all, so this data move cannot regress behavior. The personal-tier reader
-- (deriveTier, lib/core/entitlement.ts) is already TOLERANT of the old supporter label (it maps
-- supporter -> crew at read time), so the app behaves identically before and after the column flips.
--
-- HOUSE STYLE (mirrors 20260608050000_membership_tier_rename_crew.sql): idempotent CHECK swap (drop
-- constraint if exists, update, re-add), add column if not exists, re-runnable converging UPDATEs. No
-- new RPC, no RLS change (profiles RLS is unchanged). No em or en dashes in any comment or string
-- (CONTENT-VOICE). New column reached untyped from app code until lib/database.types.ts regenerates
-- (ADR-246).
--
-- ⚠️ NOT APPLIED in this PR. Ships as a FILE for owner hand-review + the db-tests fresh-apply path.
-- Do not run this against prod from the PR. Rollback notes at the foot of the file.

-- ── Prerequisites already present: public.profiles.membership_tier (text, default 'free', CHECK in
--    free / crew / supporter) from 20260608040000_membership_tier.sql +
--    20260608050000_membership_tier_rename_crew.sql.

-- ── 1. is_supporter: the pay-what-you-want Supporter badge on Crew ───────────────────────────────
-- The badge an active Supporter (PWYW contributor) wears. Backfilled true for profiles whose OLD tier
-- was 'supporter' so the retired tier becomes a visible badge instead of a lost distinction.
alter table public.profiles
  add column if not exists is_supporter boolean not null default false;

comment on column public.profiles.is_supporter is
  'Pricing ladder Phase A (ADR-458): the pay-what-you-want Supporter badge on Crew. Backfilled true for profiles whose retired membership_tier was supporter. Read untyped until lib/database.types.ts regenerates.';

update public.profiles set is_supporter = true where membership_tier = 'supporter';

-- ── 2. Collapse membership_tier to free / crew (access-preserving) ───────────────────────────────
-- Drop the old CHECK so the remap is unconstrained, remap every non-free / non-crew value to crew
-- (supporter, and any stray legacy value, preserving paid access), then re-add the narrowed CHECK.
alter table public.profiles drop constraint if exists profiles_membership_tier_check;

update public.profiles
set membership_tier = 'crew'
where membership_tier is not null and membership_tier not in ('free', 'crew');

alter table public.profiles
  add constraint profiles_membership_tier_check
  check (membership_tier in ('free', 'crew'));

comment on column public.profiles.membership_tier is
  'Billing/membership entitlement, collapsed to free / crew (ADR-458). Supporter retired as a tier (remapped to crew, access-preserving) and becomes the is_supporter PWYW badge. Orthogonal to community_role; read via deriveTier (lib/core/entitlement.ts).';

-- ── 3. supporter_contributions: DEFERRED to Phase C ──────────────────────────────────────────────
-- The PWYW contribution ledger (a record of each Supporter contribution amount + date) is part of the
-- member-facing Supporter surface in Phase C (the Crew upgrade page), not the keystone. It is left out
-- here on purpose: the badge (is_supporter, above) is all Phase A needs, and adding a ledger table now
-- would ship an unused, untyped table. Phase C adds public.supporter_contributions (RLS: a member reads
-- their own rows, staff read all; service-mediated writes) when the PWYW flow lands.

-- ── Rollback (hand-review aid) ───────────────────────────────────────────────────────────────────
-- The supporter -> crew remap is access-preserving and not precisely reversible (the original supporter
-- rows are recoverable only via the is_supporter flag captured in step 1). To reverse:
--   1. Restore the supporter tier from the badge (best effort), then widen the CHECK:
--        alter table public.profiles drop constraint if exists profiles_membership_tier_check;
--        update public.profiles set membership_tier = 'supporter' where is_supporter = true and membership_tier = 'crew';
--        alter table public.profiles
--          add constraint profiles_membership_tier_check check (membership_tier in ('free', 'crew', 'supporter'));
--   2. Drop the badge column:
--        alter table public.profiles drop column if exists is_supporter;
--   The reader deriveTier tolerates both the 2-value and 3-value shapes, so step 1 is only needed if a
--   precise supporter-tier restore is required.
