-- LIVE-821 / ADR-1709 (owner ruling 2026-10-06 21:44): a custom domain is a $19/mo add-on on Business
-- ($49 + $19 = $68) and is included with Collective. The catalog item is `addon_custom_domain`
-- (lib/billing/pricing-keys.ts); its subscription line persists under the DB item_key
-- `custom_domain`, the same way `addon_ai` persists as `ai` (itemKeyForCatalogKey in
-- lib/billing/space-subscription-items.ts maps the catalog key to the add-on key).
--
-- space_subscription_items.item_key admits `custom_domain`. The list is copied from the newest
-- definition (20270346003000_collective_plan_returns.sql) with the one value added.
--
-- No price seed: 20270346003000 seeded `plan.*` rows for the two new plans only, and add-on amounts
-- live in the code catalog. Live Stripe prices for the add-on are minted with OWN-094.
--
-- Additive and idempotent: the CHECK only widens.

begin;

alter table public.space_subscription_items
  drop constraint if exists space_subscription_items_item_key_check;
alter table public.space_subscription_items
  add constraint space_subscription_items_item_key_check
  check (item_key in (
    'base', 'business', 'collective', 'collective_space', 'nonprofit_collective', 'independent',
    'ai', 'custom_domain', 'nonprofit_seat', 'marketing', 'team', 'branding', 'operator_seat'
  ));

commit;
