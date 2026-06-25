-- =============================================================================
-- Storefront upgrade: feature gate only (ADR-39Z draft; decision ADR-393)
--
-- The storefront reuses the existing pricing seam (no new pricing system):
--   • pricing_feature_gates → gate 'space_storefront' (available to ALL plans;
--     a free Space can sell, the plan only buys features). This is the only
--     change this migration makes.
--
-- ⚠ take_rate is NOT touched here. An earlier draft of this migration also dropped
-- the platform-wide rake (practitioner 8→3% / business 5→2% / organization 3→1%),
-- but that changes LIVE pricing for EVERY Connect sale (tips, tickets, storefront),
-- not just the marketplace. On 2026-06-25 the owner elected to KEEP the current
-- 8/5/3% rake and treat the marketplace rake ladder as a separate, deliberate
-- change (see docs/DECISIONS.md ADR-393). The rake stays operator-tunable at
-- /admin/pricing; revisit it there or in a dedicated migration with sign-off.
-- =============================================================================

insert into public.pricing_feature_gates (feature, min_entitlement, enabled) values
  ('space_storefront', 'free', true)
on conflict (feature) do nothing;
