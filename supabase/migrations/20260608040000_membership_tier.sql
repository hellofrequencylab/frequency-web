-- =============================================================================
-- Entitlement tier (billing axis) — Free → Member (paid) → Supporter
-- ADR-163 · docs/ROLES.md "Entitlement" · master build list P2.1
--
-- Additive + backfilled, NON-BREAKING. Adds profiles.membership_tier — the billing
-- entitlement that is ORTHOGONAL to the community role (the ✋→✅ gate in the access
-- matrix). Until billing (P2.2) wires real upgrades, the app keeps reading the
-- crew-or-above proxy via lib/core/entitlement.ts `deriveTier`; this column is the
-- forward home the read path switches to once applied. The backfill preserves
-- today's behavior exactly: anyone above plain 'member' (the old crew-as-paid proxy)
-- starts on the paid 'member' tier.
--
-- Apply with `supabase db push`, then regenerate database.types.ts and flip
-- `deriveTier` / getViewerHats to read the column (a one-liner — see entitlement.ts).
-- =============================================================================

alter table public.profiles
  add column if not exists membership_tier text not null default 'free'
    check (membership_tier in ('free', 'member', 'supporter'));

-- Preserve today's isCrew (= community_role <> 'member') as the paid 'member' tier.
update public.profiles
  set membership_tier = 'member'
  where community_role <> 'member' and membership_tier = 'free';

comment on column public.profiles.membership_tier is
  'Billing entitlement (ADR-163): free | member (paid) | supporter. Orthogonal to community_role; read via lib/core/entitlement.ts.';
