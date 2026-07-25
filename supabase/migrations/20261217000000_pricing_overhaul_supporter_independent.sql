-- PRICING OVERHAUL (owner directive, 2026-07-25): the public ladder is Member (free), Crew $9
-- Opening Beta under a $12 list, Supporter $12, then Free Space / Business / Collective / Non Profit.
-- Independent is NOT sold (machinery stays dormant); Supporter is SOLD AGAIN at $12 (it was retired
-- to a PWYW badge by ADR-458; the checkout still writes crew + is_supporter, so no schema change).
--
-- Three guarded data fixes, all idempotent:
--   1. tier.supporter 2400/24000 (the retired default) -> 1200/12000 ($12 / $120). Guarded so an
--      operator-set custom value is never clobbered.
--   2. tier.crew gains its $12 list anchor (list_cents 1200) when absent. The code default
--      (PRICING_DEFAULTS) has carried it since ADR-463, but the seeded DB row predates it and a DB
--      row overrides code, so member surfaces reading getPricingValues lost the strike-through.
--   3. plan_independent_enabled -> false (not sold; the flag alone gates the sell path).
--      tier_supporter_enabled -> true (sell Supporter; already true in prod, kept for replays).
--
-- Rollback: reverse the three updates by hand (values above); nothing structural changes here.

-- 1. Supporter $12 / $120 (guarded: only from the retired $24 default or an absent row).
update public.pricing_settings
set value = '{"monthly_cents": 1200, "annual_cents": 12000}'::jsonb,
    updated_at = now()
where key = 'tier.supporter'
  and (value ->> 'monthly_cents')::int = 2400;

insert into public.pricing_settings (key, value)
values ('tier.supporter', '{"monthly_cents": 1200, "annual_cents": 12000}'::jsonb)
on conflict (key) do nothing;

-- 2. Crew keeps $9/$90 and gains the $12 list anchor when the row predates ADR-463 (guarded: only
--    when the price is still the $9 default and no anchor is set).
update public.pricing_settings
set value = value || '{"list_cents": 1200}'::jsonb,
    updated_at = now()
where key = 'tier.crew'
  and (value ->> 'monthly_cents')::int = 900
  and value ->> 'list_cents' is null;

-- 3. The sell switches: Supporter ON, Independent OFF.
insert into public.platform_flags (key, value) values
  ('tier_supporter_enabled', true),
  ('plan_independent_enabled', false)
on conflict (key) do update set value = excluded.value;
