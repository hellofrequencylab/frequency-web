-- Reprice the Founding Business monthly rate to the ADR-811 founding anchor ($19). The founding config
-- seed (20261198000000_pricing_admin_gaps.sql) stored $49 (4900), correct when the Business list was $49
-- (ADR-590). ADR-811 dropped Business to a $29 list with a $19 founding anchor, so the old $49 founding
-- rate ended up ABOVE the standard list price -- a founding penalty, not a discount, and it charges on
-- the live founding business checkout path (lib/founding/business-checkout.ts).
--
-- This corrects the stored value to $19 (the founding anchor under the $29 list), so founding is a real
-- discount again. The founding ladder runs $19 -> $29 -> $49 -> $79 (Business founding/list, Collective
-- founding/list). The value proposition is unchanged: a LOCKED rate plus the bought-down take-rate
-- (business_take_bps = 300 = 3% network, vs the standard 5% Business network rate). The owner may set a
-- different founder rate later, in this same row.
--
-- SAFE + IDEMPOTENT: only rewrites a row STILL holding a pre-anchor value (4900 or the interim 2900), so a
-- deliberate operator-set rate (whatever they chose in /admin/pricing) is never clobbered. Nothing charges
-- while billing_live is OFF.

update public.pricing_settings
  set value = jsonb_set(value, '{business_monthly_cents}', '1900'::jsonb)
  where key = 'founding'
    and (value->>'business_monthly_cents') in ('4900', '2900');
