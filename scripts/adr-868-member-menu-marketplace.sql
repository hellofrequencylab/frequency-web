-- ADR-868: the member sidebar's COMMUNITY section restructures (founder mandate, 2026-07-27).
-- Run ONCE against production by an operator. Idempotent: safe to re-run.
--
-- What it does to the LIVE global left menu (public.menus surface_key='left', space_id null):
--   1. Channels turns on (or is inserted) between Circles and Events  -> /channels
--   2. The Classifieds row becomes the "Marketplace" commerce umbrella -> /marketplace
--      (a cookie-driven redirect: last-visited surface, default Classifieds)
--   3. The separate Market row (/market) is DELETED (one umbrella row replaces the pair)
--   4. Housing gets the house-search icon (MapPinHouse)
--   5. Community renames to "Members" with a people icon (BookUser)   -> /network
--   6. The section reorders to: Circles · Channels · Events · Business Spaces ·
--      Marketplace · Housing · Members · My Contacts
--
-- The code defaults (lib/nav-areas.ts + lib/verticals/*) were changed in the same PR, so the
-- inserts-only sync (ADR-860) can never drift these rows back: the sync only injects default
-- hrefs that are absent, and after this script /marketplace and /channels are present. The
-- baseline append at the end is belt-and-braces so a later operator DELETE stays deleted.
-- If the left surface is NOT materialized (renders from code defaults), everything no-ops.
--
-- Verify first (expect the current community rows):
--   select mi.label, mi.href, mi.icon, mi.mode, mi.position
--     from public.menu_items mi join public.menus m on m.id = mi.menu_id
--    where m.surface_key = 'left' and m.space_id is null
--    order by mi.category_id, mi.position;

do $$
declare
  v_menu uuid;
  v_anchor uuid;   -- the Circles (fallback Events) row, used to find the community group
  v_cat uuid;      -- that group's category_id (may legitimately be NULL = menu root)
begin
  select id into v_menu
    from public.menus
   where surface_key = 'left' and space_id is null
   limit 1;
  if v_menu is null then
    raise notice 'ADR-868: left menu not materialized in DB; code defaults already carry the change. Nothing to do.';
    return;
  end if;

  -- ── 2. Marketplace: the Classifieds row becomes the commerce umbrella ─────────────
  update public.menu_items
     set label = 'Marketplace', href = '/marketplace', icon = 'Store'
   where menu_id = v_menu and href = '/classifieds';

  -- ── 3. The separate Market row leaves the rail (the umbrella replaces the pair) ───
  delete from public.menu_items
   where menu_id = v_menu and href = '/market';

  -- ── 4. Housing: the house-search icon ─────────────────────────────────────────────
  update public.menu_items
     set icon = 'MapPinHouse'
   where menu_id = v_menu and href = '/housing';

  -- ── 5. Community → Members, with a clearly-people icon ────────────────────────────
  update public.menu_items
     set label = 'Members', icon = 'BookUser'
   where menu_id = v_menu and href = '/network';

  -- ── 1. Channels: turn on an existing row, or insert one into the community group ──
  select id, category_id into v_anchor, v_cat
    from public.menu_items
   where menu_id = v_menu and href = '/circles'
   limit 1;
  if v_anchor is null then
    select id, category_id into v_anchor, v_cat
      from public.menu_items
     where menu_id = v_menu and href = '/events'
     limit 1;
  end if;

  if exists (select 1 from public.menu_items where menu_id = v_menu and href = '/channels') then
    update public.menu_items
       set mode = 'active'
     where menu_id = v_menu and href = '/channels';
  else
    insert into public.menu_items
      (menu_id, category_id, label, href, icon, position, mode, min_access)
    values
      (v_menu, v_cat, 'Channels', '/channels', 'channels', 999, 'active', 'visitor');
  end if;

  -- ── 6. Reorder the community group ─────────────────────────────────────────────────
  -- Only when we actually found the group (via the Circles/Events anchor). Unmapped rows
  -- in the same group (hidden rows like Around You / Message Boards) sink below the
  -- mapped block, keeping their relative order; `position < 100` keeps the bump idempotent.
  if v_anchor is not null then
    update public.menu_items
       set position = 100 + position
     where menu_id = v_menu
       and category_id is not distinct from v_cat
       and href not in ('/circles','/channels','/events','/spaces/directory',
                        '/marketplace','/housing','/network','/network/contacts')
       and position < 100;

    update public.menu_items mi
       set position = m.pos
      from (values
              ('/circles', 10), ('/channels', 20), ('/events', 30), ('/spaces/directory', 40),
              ('/marketplace', 50), ('/housing', 60), ('/network', 70), ('/network/contacts', 80)
           ) as m(href, pos)
     where mi.menu_id = v_menu
       and mi.category_id is not distinct from v_cat
       and mi.href = m.href;
  end if;

  -- ── Baseline: record the new default hrefs so the inserts-only sync (ADR-860) can ──
  -- never re-inject them, and a later operator delete stays deleted. Deliberately skipped
  -- when the baseline is still empty: an empty baseline means "first sync trusts the
  -- current state", and seeding it here would flip that sync into injecting every other
  -- absent default. (Both rows exist after this script, so no duplicate is possible
  -- either way; this is protection for future deletes only.)
  update public.menus
     set synced_default_keys = (
           select coalesce(jsonb_agg(distinct k), '[]'::jsonb)
             from (
               select jsonb_array_elements_text(synced_default_keys) as k
                 from public.menus where id = v_menu
               union
               select unnest(array['/channels', '/marketplace'])
             ) s
         )
   where id = v_menu
     and synced_default_keys <> '[]'::jsonb;

  raise notice 'ADR-868: left-menu community section restructured.';
end $$;

-- Verify after (expect: Circles 10 · Channels 20 · Events 30 · Business Spaces 40 ·
-- Marketplace 50 · Housing 60 · Members 70 · My Contacts 80; no /classifieds or /market row):
--   select mi.label, mi.href, mi.icon, mi.mode, mi.position
--     from public.menu_items mi join public.menus m on m.id = mi.menu_id
--    where m.surface_key = 'left' and m.space_id is null
--    order by mi.category_id, mi.position;
