-- LIVE-747 / ADR-1709: the five-tier ladder brings Collective back as its own Space plan above
-- Business, with Non Profit Collective beside it and an extra member Space as a per-Space item.
--
-- 1. space_billing_agreements.plan admits `collective` and `nonprofit_collective` again
--    (20270345006100 dropped collective when ADR-1438 folded it into Business).
-- 2. space_subscription_items.item_key admits the three Collective items. Production read on
--    2026-10-06 showed this CHECK WITHOUT `collective` and `independent`, although 20261208000000
--    (which added them) is stamped as applied: the constraint drifted. Re-adding the full set here
--    repairs that drift too, so an Independent or Collective subscription line is never dropped.
-- 3. The operator-editable price rows for the two new plans, at the catalog amounts. A row that an
--    operator already wrote is left alone.
--
-- Additive and idempotent: both CHECKs only widen, and the inserts skip existing keys. No stored
-- `collective` plan label exists in production (read 2026-10-06), so nothing changes plan.

begin;

alter table public.space_billing_agreements
  drop constraint if exists space_billing_agreements_plan_check;
alter table public.space_billing_agreements
  add constraint space_billing_agreements_plan_check
  check (plan in ('business', 'nonprofit', 'independent', 'collective', 'nonprofit_collective'));

alter table public.space_subscription_items
  drop constraint if exists space_subscription_items_item_key_check;
alter table public.space_subscription_items
  add constraint space_subscription_items_item_key_check
  check (item_key in (
    'base', 'business', 'collective', 'collective_space', 'nonprofit_collective', 'independent',
    'ai', 'nonprofit_seat', 'marketing', 'team', 'branding', 'operator_seat'
  ));

insert into public.pricing_settings (key, value)
values
  ('plan.collective', '{"monthly_cents": 14900, "annual_cents": 149000}'::jsonb),
  ('plan.nonprofit_collective', '{"monthly_cents": 11900, "annual_cents": 119000}'::jsonb)
on conflict (key) do nothing;

commit;
