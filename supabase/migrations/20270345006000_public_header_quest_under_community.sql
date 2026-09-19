-- MENU CACHE: deploy after applying. The marketing surfaces are STATIC with
-- `revalidate = 3600` (app/(marketing)/layout.tsx deliberately avoids cookies()/getUser() so they
-- stay static), and raw SQL cannot call revalidatePath. So the public header served from the edge
-- keeps its four tabs for up to one hour after this runs, or until a deploy rebuilds those pages.
-- Bounded, not indefinite. Apply this WITH the deploy that carries the matching code defaults.
--
-- LIVE-254: The Quest leaves the public header as a top-level pillar. It becomes a ROW in
-- The Community panel, with Journeys / Practices / Channels (topics) moving with it. The page,
-- the flat footer link, and the sitemap entry stay. Sitemap priority is already 0.6.
--
-- Run ONCE against production. Idempotent: safe to re-run, and a no-op after the first run.
--
-- ── WHY THIS IS A DATA MIGRATION AND NOT JUST A CODE EDIT ────────────────────────────────
-- The live public header is DB ROWS. `lib/menus/read.ts` PREFERS those rows over the code
-- defaults in `lib/nav/registry.ts`. LIVE-250's `20270345004400` already taught this: editing
-- HEADER_TRIGGER_SEEDS alone changes the fallback and moves nothing a visitor can see.
--
-- ── WHAT CHANGES, AND WHAT DOES NOT ─────────────────────────────────────────────────────
--   1. Every item currently sitting in the category that holds `/the-quest` MOVES into the
--      category that holds `/the-community`, appended after that panel's last row, in the
--      same relative order they had. The emptied Quest category is deleted.
--   2. If `/the-quest` is already in the Community category, this is a no-op.
--   3. The footer is UNTOUCHED. It is the site map; `/the-quest` stays a flat primary page
--      the way `/the-lab` did after LIVE-250.
--   4. `menus.synced_default_keys` is left alone when it is `[]` (the LIVE-250 lesson).
--
-- Verify AFTER (expect 3 parentless categories, and `/the-quest` inside The Community panel):
--   select c.label, c.position, count(i.id) as items
--     from public.menus m
--     join public.menu_categories c on c.menu_id = m.id and c.parent_id is null
--     left join public.menu_items i on i.category_id = c.id
--    where m.surface_key = 'header' and m.space_id is null
--    group by c.label, c.position order by c.position;
--   select i.label, i.href, i.position
--     from public.menu_items i join public.menus m on m.id = i.menu_id
--    where m.surface_key = 'header' and i.href = '/the-quest';

do $$
declare
  v_menu        uuid;
  v_community   uuid;
  v_quest_cat   uuid;
  v_append_at   int;
  v_n           int;
begin
  select id into v_menu
    from public.menus
   where surface_key = 'header' and space_id is null
   limit 1;
  if v_menu is null then
    raise notice 'LIVE-254: header menu is not materialized in the DB; the code defaults already nest The Quest under The Community. Nothing to do.';
    return;
  end if;

  -- Find the Community panel by the row it CONTAINS, not by its label (LIVE-250: the live
  -- label is an operator's to change; the destination is the contract).
  select c.id into v_community
    from public.menu_categories c
    join public.menu_items i on i.category_id = c.id
   where c.menu_id = v_menu and i.href = '/the-community'
   limit 1;
  if v_community is null then
    raise exception 'LIVE-254: no header category contains /the-community, so The Quest has nowhere to land. Refusing to delete its tab.';
  end if;

  select category_id into v_quest_cat
    from public.menu_items
   where menu_id = v_menu and href = '/the-quest'
   limit 1;

  if v_quest_cat is null then
    raise notice 'LIVE-254: no /the-quest row in the live header (an operator removed it). Leaving the Community panel alone.';
    return;
  end if;

  if v_quest_cat = v_community then
    raise notice 'LIVE-254: /the-quest already sits in The Community panel. Nothing to do.';
    return;
  end if;

  select coalesce(max(position), -1) into v_append_at
    from public.menu_items
   where menu_id = v_menu and category_id = v_community;

  -- Move the whole Quest panel, in its existing order, onto the end of Community.
  -- `position` is a plain index with no unique constraint, so a batch shift cannot collide.
  v_n := 0;
  update public.menu_items i
     set category_id = v_community,
         position = v_append_at + sub.rn
    from (
      select id, row_number() over (order by position, id) as rn
        from public.menu_items
       where menu_id = v_menu and category_id = v_quest_cat
    ) as sub
   where i.id = sub.id;

  get diagnostics v_n = row_count;

  if not exists (select 1 from public.menu_items where category_id = v_quest_cat)
     and not exists (select 1 from public.menu_categories where parent_id = v_quest_cat) then
    delete from public.menu_categories where id = v_quest_cat;
  end if;

  raise notice 'LIVE-254: moved % header item(s) from The Quest tab into The Community panel.', v_n;
end $$;
