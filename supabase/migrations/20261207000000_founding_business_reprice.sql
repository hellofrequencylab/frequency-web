-- Reprice the Founding Business monthly rate to the ADR-811 Business list ($29). The founding config seed
-- (20261198000000_pricing_admin_gaps.sql) stored $49 (4900), correct when the Business list was $49
-- (ADR-590). ADR-811 dropped Business to $29 (2900), so the founding "locked rate" ended up $20/mo ABOVE
-- the standard list price -- a founding penalty, not a discount, and it charges on the live founding
-- business checkout path (lib/founding/business-checkout.ts).
--
-- This corrects the stored value to $29 so founding is never more expensive than simply buying Business.
-- The founding value proposition is unchanged: a LOCKED rate plus the bought-down take-rate
-- (business_take_bps = 300 = 3% network, vs the standard 5% Business network rate). The owner may set a
-- LOWER founder discount later, in this same row.
--
-- SAFE + IDEMPOTENT: only rewrites a row STILL holding the stale 4900, so a deliberate operator-set rate
-- (whatever they chose in /admin/pricing) is never clobbered. Nothing charges while billing_live is OFF.

update public.pricing_settings
  set value = jsonb_set(value, '{business_monthly_cents}', '2900'::jsonb)
  where key = 'founding'
    and (value->>'business_monthly_cents') = '4900';
