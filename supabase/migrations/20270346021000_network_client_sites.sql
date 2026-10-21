-- LIVE-1118 (Network website reseller program, ADR-1816, owner "do it" 2026-10-21).
-- A Network resells websites: each client site is a Business-level Space that the Network pays for, not a
-- chapter (no shared membership, so parent_id stays null).
--
-- 1. spaces.reseller_network_id points a client site at the Network that resells and pays for it. Null for
--    every other Space. A deleted Network leaves its sites standing (set null); the hand-off to the member
--    (a later PR) clears it on purpose.
-- 2. space_subscription_items.item_key admits the four client-site lines: network_site (sites 1 to 10),
--    network_site_mid (11 to 25), network_site_high (26 and up) and network_site_unbranded (badge removal).
--    The list is copied from the newest definition (20270346009100_network_checkout.sql) with the four added.
--
-- Additive and idempotent: the column is `if not exists`, the CHECK only widens.

begin;

alter table public.spaces
  add column if not exists reseller_network_id uuid references public.spaces(id) on delete set null;

create index if not exists spaces_reseller_network_id_idx
  on public.spaces (reseller_network_id) where reseller_network_id is not null;

comment on column public.spaces.reseller_network_id is
  'The Network Space that resells this Space as a client website and pays for it per site (ADR-1816). Null otherwise.';

alter table public.space_subscription_items
  drop constraint if exists space_subscription_items_item_key_check;
alter table public.space_subscription_items
  add constraint space_subscription_items_item_key_check
  check (item_key in (
    'base', 'business', 'collective', 'collective_space', 'nonprofit_collective', 'independent',
    'network', 'network_chapter',
    'network_site', 'network_site_mid', 'network_site_high', 'network_site_unbranded',
    'ai', 'custom_domain', 'nonprofit_seat', 'marketing', 'team', 'branding', 'operator_seat'
  ));

commit;
