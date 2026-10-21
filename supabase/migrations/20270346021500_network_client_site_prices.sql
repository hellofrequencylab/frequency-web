-- LIVE-1119 (Network website reseller program, ADR-1816; owner "Yes, create them" 2026-10-21).
-- The four client-site Stripe products and their eight prices were created by hand on the live account the
-- same day, with the catalog sync's metadata, so the sync finds them later instead of minting duplicates.
-- This maps the sixteen catalog keys to them. Client sites have no founding rate (founding == list), so each
-- `_list` key points at the same price as its founding key, which is the one billing uses; `_list` rows are
-- archived, as the sync writes them. A row an operator or a sync already wrote is left alone.
--
-- Additive and idempotent: the inserts skip existing keys.

begin;

insert into public.pricing_stripe_prices (key, stripe_product_id, stripe_price_id, archived, stripe_account_id, livemode)
values
  ('network_site_month', 'prod_VTmjQ8ZOAeHseV', 'price_1USpA9PhyalyRPP1sytSnYd2', false, 'acct_1TdurHPhyalyRPP1', true),
  ('network_site_month_list', 'prod_VTmjQ8ZOAeHseV', 'price_1USpA9PhyalyRPP1sytSnYd2', true, 'acct_1TdurHPhyalyRPP1', true),
  ('network_site_year', 'prod_VTmjQ8ZOAeHseV', 'price_1USpAGPhyalyRPP1Irot43HO', false, 'acct_1TdurHPhyalyRPP1', true),
  ('network_site_year_list', 'prod_VTmjQ8ZOAeHseV', 'price_1USpAGPhyalyRPP1Irot43HO', true, 'acct_1TdurHPhyalyRPP1', true),
  ('network_site_mid_month', 'prod_VTmjxei6aVCv1a', 'price_1USpAIPhyalyRPP1k2cBqcRF', false, 'acct_1TdurHPhyalyRPP1', true),
  ('network_site_mid_month_list', 'prod_VTmjxei6aVCv1a', 'price_1USpAIPhyalyRPP1k2cBqcRF', true, 'acct_1TdurHPhyalyRPP1', true),
  ('network_site_mid_year', 'prod_VTmjxei6aVCv1a', 'price_1USpALPhyalyRPP1krV7OZsH', false, 'acct_1TdurHPhyalyRPP1', true),
  ('network_site_mid_year_list', 'prod_VTmjxei6aVCv1a', 'price_1USpALPhyalyRPP1krV7OZsH', true, 'acct_1TdurHPhyalyRPP1', true),
  ('network_site_high_month', 'prod_VTmjotosXVmYw1', 'price_1USpAmPhyalyRPP1cHzWGhT4', false, 'acct_1TdurHPhyalyRPP1', true),
  ('network_site_high_month_list', 'prod_VTmjotosXVmYw1', 'price_1USpAmPhyalyRPP1cHzWGhT4', true, 'acct_1TdurHPhyalyRPP1', true),
  ('network_site_high_year', 'prod_VTmjotosXVmYw1', 'price_1USpApPhyalyRPP1nKiFsee2', false, 'acct_1TdurHPhyalyRPP1', true),
  ('network_site_high_year_list', 'prod_VTmjotosXVmYw1', 'price_1USpApPhyalyRPP1nKiFsee2', true, 'acct_1TdurHPhyalyRPP1', true),
  ('network_site_unbranded_month', 'prod_VTmjx5STvqK0dC', 'price_1USpBHPhyalyRPP1DJmxZ4t7', false, 'acct_1TdurHPhyalyRPP1', true),
  ('network_site_unbranded_month_list', 'prod_VTmjx5STvqK0dC', 'price_1USpBHPhyalyRPP1DJmxZ4t7', true, 'acct_1TdurHPhyalyRPP1', true),
  ('network_site_unbranded_year', 'prod_VTmjx5STvqK0dC', 'price_1USpBKPhyalyRPP1VZSdYYKl', false, 'acct_1TdurHPhyalyRPP1', true),
  ('network_site_unbranded_year_list', 'prod_VTmjx5STvqK0dC', 'price_1USpBKPhyalyRPP1VZSdYYKl', true, 'acct_1TdurHPhyalyRPP1', true)
on conflict (key) do nothing;

commit;
