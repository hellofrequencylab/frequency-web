-- SCAN-980 (owner 2026-10-16, "Create all six" then "go"): Network checkout opens. The three Network
-- Stripe products and their six prices were created by hand on the live account the same day, with the
-- catalog sync's metadata, so the sync finds them later instead of minting duplicates.
--
-- 1. space_subscription_items.item_key admits `network` (network_base and nonprofit_network both persist
--    as `network`) and `network_chapter` (a chapter past the ten included). The list is copied from the
--    newest definition (20270346005700_custom_domain_addon.sql) with the two values added.
-- 2. pricing_stripe_prices maps the six Network keys to those prices. Network has no founding rate
--    (founding == list), so each `_list` key points at the same price as its founding key, which is the
--    one checkout charges; `_list` rows are archived, as the sync writes them. A row an operator or a
--    sync already wrote is left alone.
--
-- Additive and idempotent: the CHECK only widens, and the inserts skip existing keys.

begin;

alter table public.space_subscription_items
  drop constraint if exists space_subscription_items_item_key_check;
alter table public.space_subscription_items
  add constraint space_subscription_items_item_key_check
  check (item_key in (
    'base', 'business', 'collective', 'collective_space', 'nonprofit_collective', 'independent',
    'network', 'network_chapter',
    'ai', 'custom_domain', 'nonprofit_seat', 'marketing', 'team', 'branding', 'operator_seat'
  ));

insert into public.pricing_stripe_prices (key, stripe_product_id, stripe_price_id, archived, stripe_account_id, livemode)
values
  ('network_base_month',           'prod_VS94uG9c3FQWlq', 'price_1UREmtPhyalyRPP1cFZwkpf0', false, 'acct_1TdurHPhyalyRPP1', true),
  ('network_base_month_list',      'prod_VS94uG9c3FQWlq', 'price_1UREmtPhyalyRPP1cFZwkpf0', true,  'acct_1TdurHPhyalyRPP1', true),
  ('network_base_year',            'prod_VS94uG9c3FQWlq', 'price_1UREnAPhyalyRPP17uCDDy3U', false, 'acct_1TdurHPhyalyRPP1', true),
  ('network_base_year_list',       'prod_VS94uG9c3FQWlq', 'price_1UREnAPhyalyRPP17uCDDy3U', true,  'acct_1TdurHPhyalyRPP1', true),
  ('nonprofit_network_month',      'prod_VS9450qUpAfgH2', 'price_1UREnDPhyalyRPP15YUsDeab', false, 'acct_1TdurHPhyalyRPP1', true),
  ('nonprofit_network_month_list', 'prod_VS9450qUpAfgH2', 'price_1UREnDPhyalyRPP15YUsDeab', true,  'acct_1TdurHPhyalyRPP1', true),
  ('nonprofit_network_year',       'prod_VS9450qUpAfgH2', 'price_1UREnGPhyalyRPP1CsIP1Oa5', false, 'acct_1TdurHPhyalyRPP1', true),
  ('nonprofit_network_year_list',  'prod_VS9450qUpAfgH2', 'price_1UREnGPhyalyRPP1CsIP1Oa5', true,  'acct_1TdurHPhyalyRPP1', true),
  ('network_chapter_month',        'prod_VS94rOVWRhhWXf', 'price_1UREnIPhyalyRPP1Ul4EqToq', false, 'acct_1TdurHPhyalyRPP1', true),
  ('network_chapter_month_list',   'prod_VS94rOVWRhhWXf', 'price_1UREnIPhyalyRPP1Ul4EqToq', true,  'acct_1TdurHPhyalyRPP1', true),
  ('network_chapter_year',         'prod_VS94rOVWRhhWXf', 'price_1UREnLPhyalyRPP17J4QI5wM', false, 'acct_1TdurHPhyalyRPP1', true),
  ('network_chapter_year_list',    'prod_VS94rOVWRhhWXf', 'price_1UREnLPhyalyRPP17J4QI5wM', true,  'acct_1TdurHPhyalyRPP1', true)
on conflict (key) do nothing;

commit;
