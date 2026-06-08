-- =============================================================================
-- Entitlement tier rename — the paid tier is "Crew"
-- ADR-163 (corrected model) · docs/ROLES.md "Entitlement"
--
-- "Everyone is part of the Crew on the paid tier — that's the membership point."
-- The paid membership tier is named Crew (not Member); Member is the free tier.
-- Values: free | crew | supporter. Renames the prior 'member' tier value → 'crew'.
-- Paid access is the TIER, fully decoupled from the community role.
-- =============================================================================

alter table public.profiles drop constraint if exists profiles_membership_tier_check;

update public.profiles set membership_tier = 'crew' where membership_tier = 'member';

alter table public.profiles
  add constraint profiles_membership_tier_check
  check (membership_tier in ('free', 'crew', 'supporter'));

comment on column public.profiles.membership_tier is
  'Billing/membership entitlement (ADR-163): free | crew (paid) | supporter. Orthogonal to community_role; read via lib/core/entitlement.ts.';
