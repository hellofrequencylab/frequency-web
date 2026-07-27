-- ADR-866: /marketplace/events merges into /events (the retired-marketplace-namespace
-- pass ADR-862 flagged as a follow-up). Run ONCE against production by an operator.
--
-- The repo's migrations and seeds carry no /marketplace/events hrefs, so this only
-- touches rows an operator created live through the menu editor. Both UPDATEs are
-- guarded by the WHERE clause: if no live row points at the old route, they are no-ops.
-- The 308 redirect in next.config.ts keeps any missed link working regardless; this
-- just stops the live menus from bouncing members through a redirect.
--
-- Verify first (expect zero or a handful of rows):
--   select id, label, href from public.menu_items       where href like '/marketplace/events%';
--   select id, title, href from public.menu_rail_cards  where href like '/marketplace/events%';

begin;

-- Exact match: the tab/link to the events index.
update public.menu_items
set href = '/events'
where href = '/marketplace/events';

update public.menu_rail_cards
set href = '/events'
where href = '/marketplace/events';

-- Deep links (querystrings or subpaths), rewritten prefix-preserving.
update public.menu_items
set href = '/events' || substring(href from length('/marketplace/events') + 1)
where href like '/marketplace/events/%'
   or href like '/marketplace/events?%';

update public.menu_rail_cards
set href = '/events' || substring(href from length('/marketplace/events') + 1)
where href like '/marketplace/events/%'
   or href like '/marketplace/events?%';

commit;

-- Verify after (expect zero rows):
--   select id, href from public.menu_items       where href like '/marketplace/events%';
--   select id, href from public.menu_rail_cards  where href like '/marketplace/events%';
