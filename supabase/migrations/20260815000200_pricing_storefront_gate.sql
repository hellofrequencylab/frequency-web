-- =============================================================================
-- Storefront upgrade: feature gate + approachable take-rate ladder (ADR-39Z)
--
-- The storefront reuses the existing pricing seam (no new pricing system):
--   • pricing_feature_gates  → gate 'space_storefront' (available to ALL plans;
--     a free Space can sell, the plan only buys the rake down + features)
--   • pricing_settings.take_rate (basis points) → the per-sale rake, already
--     read by spaceTakeRateCents(gross, plan) and dropping as the plan rises.
--
-- ⚠ The take_rate UPDATE below changes LIVE pricing (the platform's cut). It is
-- gated: apply only with explicit owner sign-off. Operator-tunable at /admin/pricing.
-- Uses ONLY the three existing keys the reader knows (lib/billing/pricing-keys.ts),
-- so no code change is required: practitioner 3% / business 2% / organization 1%.
-- (A free Space / Maker falls through to the practitioner rate today; a distinct
-- free/maker rate is a follow-up that also touches takeRateBpsForPlan.)
-- =============================================================================

insert into public.pricing_feature_gates (feature, min_entitlement, enabled) values
  ('space_storefront', 'free', true)
on conflict (feature) do nothing;

update public.pricing_settings
   set value = jsonb_build_object(
        'practitioner_bps', 300,
        'business_bps',     200,
        'organization_bps', 100
      )
 where key = 'take_rate';
