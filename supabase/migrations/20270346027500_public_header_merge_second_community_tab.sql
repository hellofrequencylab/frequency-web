-- MENU CACHE: deploy after applying. The marketing surfaces are static with `revalidate = 3600`,
-- so the public header can keep the old tab for up to one hour after this runs, or until a deploy
-- rebuilds those pages.
--
-- LIVE-1912: the public header showed TWO community tabs. The first is "Community" (the panel that
-- leads with /the-community and carries The Quest, Journeys, Practices and Channels). The second,
-- labelled "The Community", is a stray two-row panel: Partners and The Quest. Both rows already have a
-- twin in the first panel. This moves the two rows into the Spaces tab (Partners is the shops,
-- studios and makers door, and Spaces is where the network lives) and removes the stray tab.
--
-- Run ONCE against production. Idempotent: a no-op when the stray tab is already gone.
-- Finds tabs by the rows they hold, not by label (an operator owns the label).
--
-- Verify AFTER (expect no second community tab; Partners and The Quest inside Spaces):
--   select c.label, c.position, count(i.id) from public.menus m
--     join public.menu_categories c on c.menu_id = m.id and c.parent_id is null
--     left join public.menu_items i on i.category_id = c.id
--    where m.surface_key = 'header' and m.space_id is null group by 1, 2 order by 2;

do $$
declare
  v_menu      uuid;
  v_community uuid;
  v_spaces    uuid;
  v_stray     uuid;
  v_append_at int;
  v_n         int;
begin
  select id into v_menu from public.menus where surface_key = 'header' and space_id is null limit 1;
  if v_menu is null then
    raise notice 'LIVE-1912: header menu is not materialized in the DB; the code defaults already have one community tab.';
    return;
  end if;

  select c.id into v_community
    from public.menu_categories c join public.menu_items i on i.category_id = c.id
   where c.menu_id = v_menu and c.parent_id is null and i.href = '/the-community'
   limit 1;
  select c.id into v_spaces
    from public.menu_categories c join public.menu_items i on i.category_id = c.id
   where c.menu_id = v_menu and c.parent_id is null and i.href = '/spaces'
   limit 1;

  -- The stray tab: a parentless community-labelled tab that is not the one holding /the-community.
  select c.id into v_stray
    from public.menu_categories c
   where c.menu_id = v_menu and c.parent_id is null
     and c.label ilike '%community%'
     and c.id is distinct from v_community
     and not exists (select 1 from public.menu_categories k where k.parent_id = c.id)
   limit 1;

  if v_stray is null then
    raise notice 'LIVE-1912: no second community tab in the live header. Nothing to do.';
    return;
  end if;
  if v_spaces is null then
    raise exception 'LIVE-1912: no header tab contains /spaces, so the two rows have nowhere to land. Refusing to delete the stray tab.';
  end if;

  select coalesce(max(position), -1) into v_append_at
    from public.menu_items where menu_id = v_menu and category_id = v_spaces;

  update public.menu_items i
     set category_id = v_spaces, position = v_append_at + sub.rn
    from (select id, row_number() over (order by position, id) as rn
            from public.menu_items where menu_id = v_menu and category_id = v_stray) sub
   where i.id = sub.id;
  get diagnostics v_n = row_count;

  delete from public.menu_categories c
   where c.id = v_stray
     and not exists (select 1 from public.menu_items where category_id = c.id);

  raise notice 'LIVE-1912: moved % row(s) from the second community tab into Spaces and removed the tab.', v_n;
end $$;
