-- =============================================================================
-- Entitlement tier (billing axis) — Free → Crew (paid) → Supporter
-- ADR-163 · docs/ROLES.md "Entitlement" · master build list P2.1
--
-- Additive + backfilled, NON-BREAKING. Adds profiles.membership_tier — the billing
-- entitlement that is ORTHOGONAL to the community role (the ✋→✅ gate in the access
-- matrix). The vocabulary is free | **crew** (paid) | supporter, matching the live
-- schema and lib/core/entitlement.ts (`ENTITLEMENT_TIERS = ['free','crew','supporter']`,
-- `deriveTier` reads this column). The backfill preserves today's behavior: anyone above
-- plain 'member' community_role (the old crew-as-paid proxy) starts on the paid 'crew' tier.
--
-- CORRECTION (2026-06-14): this file originally specced the paid tier as 'member'. The
-- schema that actually shipped — and the code — settled on **'crew'** (live CHECK is
-- `free|crew|supporter`); the file is corrected to match so a fresh `db push` produces the
-- real schema instead of a 'member' column the code would misread. Idempotent on the live
-- DB (the column already exists).
-- =============================================================================

alter table public.profiles
  add column if not exists membership_tier text not null default 'free'
    check (membership_tier in ('free', 'crew', 'supporter'));

-- Preserve today's isCrew (= community_role <> 'member') as the paid 'crew' tier.
update public.profiles
  set membership_tier = 'crew'
  where community_role <> 'member' and membership_tier = 'free';

comment on column public.profiles.membership_tier is
  'Billing entitlement (ADR-163): free | crew (paid) | supporter. Orthogonal to community_role; read via lib/core/entitlement.ts.';
