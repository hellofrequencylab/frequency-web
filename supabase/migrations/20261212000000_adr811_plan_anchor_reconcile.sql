-- Reconcile the pricing_settings plan anchors to the ADR-811 Community Collective ladder
-- (owner-confirmed 2026-07-25: Business $29 list / $19 beta, Collective $79 / $49 beta, Non Profit $39).
--
-- The prod rows still held the RETIRED ADR-590 flat model (Business $49/$490, Non Profit $29/$290 —
-- exactly the pre-ADR-811 values), because the ADR-811 re-tier updated the CATALOG amounts (the
-- charged path) and the founding config, but never these legacy plan.* anchor rows. They still matter:
-- syncPricingProductsToStripe mints the business_monthly / nonprofit_monthly product prices from them
-- (the prod business_monthly Stripe price, synced 2026-06-23, holds the stale $49 — the meta-scan HIGH
-- founding-checkout mispricing rode on it), and any surface reading getPricingValues().plan shows them.
--
-- SAFE + IDEMPOTENT (mirrors 20261207000000): each update only rewrites a row STILL holding its exact
-- known-stale pair, so a deliberate operator-set rate from /admin/pricing is never clobbered. Nothing
-- charges while billing_live is OFF. After this applies, the owner should re-run the Stripe product +
-- catalog syncs so business_monthly/nonprofit_* re-mint at the corrected anchors (and the missing
-- collective_base / independent_base keys mint at all).

update public.pricing_settings
  set value = jsonb_set(jsonb_set(value, '{monthly_cents}', '2900'::jsonb), '{annual_cents}', '29000'::jsonb)
  where key = 'plan.business'
    and value->>'monthly_cents' = '4900'
    and value->>'annual_cents' = '49000';

update public.pricing_settings
  set value = jsonb_set(jsonb_set(value, '{monthly_cents}', '3900'::jsonb), '{annual_cents}', '39000'::jsonb)
  where key = 'plan.nonprofit'
    and value->>'monthly_cents' = '2900'
    and value->>'annual_cents' = '29000';
