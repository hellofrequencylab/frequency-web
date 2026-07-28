-- Put the BETA anchors in the pricing config (owner-confirmed 2026-07): Business is $29 with a $19 beta
-- rate, Collective is $79 with a $49 beta rate, and both beta rates are grandfathered for as long as the
-- Space keeps the plan. Non Profit ($39) and Independent ($249) carry NO beta rate, so they keep a single
-- price and never render a crossed-out anchor.
--
-- THE IDIOM (ADR-463, mirroring `tier.crew` = $9 under a $12 list): `monthly_cents` is the price that is
-- CHARGED and `list_cents` is the crossed-out anchor it sits under. The prod rows carried the LIST amount
-- in `monthly_cents` with no anchor, so /pricing and the legacy `business_monthly` Stripe product both
-- read $29 while the catalog (business_base) charges $19. This aligns the two layers on the anchor idiom
-- the display code (lib/pricing/display.ts priceRow) already understands.
--
-- SAFE + IDEMPOTENT (mirrors 20261212000000): each update only rewrites a row STILL holding its exact
-- known pre-anchor pair, so a deliberate operator-set rate from /admin/pricing is never clobbered. The
-- Collective + Independent rows are INSERTed only when absent. Nothing charges while billing_live is OFF.
-- After this applies, re-run the Stripe product sync so business_monthly re-mints at the beta rate.

-- Business: $29/$290 flat -> $19/$190 charged under a $29 anchor.
update public.pricing_settings
  set value = jsonb_set(
        jsonb_set(
          jsonb_set(value, '{monthly_cents}', '1900'::jsonb),
          '{annual_cents}', '19000'::jsonb),
        '{list_cents}', '2900'::jsonb)
  where key = 'plan.business'
    and value->>'monthly_cents' = '2900'
    and value->>'annual_cents' = '29000'
    and value->'list_cents' is null;

-- Collective: $79/$790 with a same-value anchor (which renders as no anchor) -> $49/$490 under a $79 one.
update public.pricing_settings
  set value = jsonb_set(
        jsonb_set(
          jsonb_set(value, '{monthly_cents}', '4900'::jsonb),
          '{annual_cents}', '49000'::jsonb),
        '{list_cents}', '7900'::jsonb)
  where key = 'plan.collective'
    and value->>'monthly_cents' = '7900'
    and value->>'annual_cents' = '79000';

-- Collective + Independent are first-class sellable tiers (ADR-811) but were never seeded as editable
-- rows, so /admin/pricing had nothing to edit for them. Seed them at the code defaults, only when absent.
insert into public.pricing_settings (key, value)
values
  ('plan.collective',  '{"monthly_cents": 4900, "annual_cents": 49000, "list_cents": 7900}'::jsonb),
  ('plan.independent', '{"monthly_cents": 24900, "annual_cents": 249000}'::jsonb)
on conflict (key) do nothing;
