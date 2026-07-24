-- Community Collective GO-LIVE (ADR-811). Flip the pricing flags ON so the six-tier ladder is sellable:
-- the master `billing_live` switch, the paid member tier (Crew), and all four space plans
-- (Business / Collective / Nonprofit / Independent). This also SEEDS the two new plan switches
-- (plan_collective_enabled / plan_independent_enabled) that ship with ADR-811.
--
-- WHY A MIGRATION: platform_flags is the deployed source of truth the resolvers read (loadPricingFlags,
-- billingLive). An operator could flip these at /admin/pricing, but the launch intent is that the
-- deployed DB comes up LIVE, deterministically, so this upserts the target state.
--
-- ⚠ THE MASTER GATE STILL HOLDS: billingLive() = billingEnabled() (STRIPE_SECRET_KEY present in the
--   server env, lib/billing/stripe.ts) AND this billing_live flag. Setting billing_live = true here is
--   INERT until the Stripe secret key is set in the production environment. So nothing can charge from
--   this migration alone; it only removes the DB half of the gate. Two owner-only ops steps remain
--   before real money moves: (1) set STRIPE_SECRET_KEY in the production env, (2) run the pricing catalog
--   sync at /admin/pricing so every catalog_base + add-on price is minted in Stripe (the checkout paths
--   resolve a synced price id or no-op).
--
-- IDEMPOTENT: upsert on the unique `key`, so re-running just re-asserts the target booleans. A future
-- operator toggle at /admin/pricing overrides these values normally (this does not lock them).

begin;

insert into public.platform_flags (key, value) values
  ('billing_live',              true),  -- MASTER (still gated by STRIPE_SECRET_KEY in the server env)
  ('tier_crew_enabled',         true),  -- Crew, the paid member tier ($9/mo)
  ('plan_business_enabled',     true),  -- Business ($29 list / $19 founding)
  ('plan_nonprofit_enabled',    true),  -- Non Profit ($39 flat)
  ('plan_collective_enabled',   true),  -- Collective ($79 list / $49 beta founding) — NEW (ADR-811)
  ('plan_independent_enabled',  true)   -- Independent ($249 flat, standalone white-label) — NEW (ADR-811)
on conflict (key) do update set value = excluded.value;

commit;
