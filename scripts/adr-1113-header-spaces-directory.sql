-- ADR-1113: the public header's "Spaces directory" row lands on the Spaces directory (LIVE-107).
-- Run ONCE against production by an operator. Idempotent: safe to re-run.
--
-- ── WHAT WAS WRONG, AND HOW IT GOT THAT WAY ─────────────────────────────────────────────
-- A dropdown TRIGGER carries no href of its own (lib/menus/project.ts::categoryTriggers), so a
-- landing page that is not also a ROW inside its own panel has no path from the header at all.
-- docs/MENU-AUDIT-2026-08-06.md row 3 found exactly that for Spaces ("/spaces is unreachable
-- from the header") and routed the repair to the DB. The repair that landed RELABELLED the
-- directory row instead of adding a landing row: the live `header` menu carries
--   label 'Spaces directory'  ->  href '/spaces'
-- so a visitor who follows the obvious label reaches the marketing page, and the real Spaces
-- directory has no path from the public header. `/spaces/directory` also sits in
-- `synced_default_keys`, and the sync (ADR-860) is inserts-only and skips anything already in
-- that set, so the engine can never resurrect it.
--
-- ── THE FIX, BOTH HALVES ────────────────────────────────────────────────────────────────
-- CODE (same PR): lib/nav/registry.ts's Spaces trigger now leads with its own landing row
-- ('Spaces' -> /spaces) and points the directory row at '/discover/spaces' — the PUBLIC twin.
-- Not '/spaces/directory': that is the app-shell twin, app/robots.ts disallows it so it cannot
-- cannibalise the canonical, and the (main) layout already redirects a signed-out visitor from
-- it to /discover/spaces. A public header should link the public page, not bounce through a
-- noindex twin.
-- DATA (this script): the live row is renamed to match where it goes, and the directory row is
-- added beside it. After this, DB and code agree, so the sync has nothing to inject.
--
-- Verify first (expect: 'Spaces directory' -> '/spaces', and no '/discover/spaces' row):
--   select mi.label, mi.href, mi.position
--     from public.menu_items mi join public.menus m on m.id = mi.menu_id
--    where m.surface_key = 'header' and mi.href in ('/spaces', '/spaces/directory', '/discover/spaces')
--    order by mi.position;

do $$
declare
  v_menu uuid;
  v_cat  uuid;   -- the Spaces category (may legitimately be NULL = menu root)
  v_pos  int;
begin
  select id into v_menu
    from public.menus
   where surface_key = 'header' and space_id is null
   limit 1;
  if v_menu is null then
    raise notice 'ADR-1113: header menu not materialized in DB; code defaults already carry the fix. Nothing to do.';
    return;
  end if;

  -- ── 1. The mislabelled row says where it goes ───────────────────────────────────────
  -- Matched on the HREF, not the label, so a re-run after the rename is a no-op rather than
  -- renaming something else. The subheading follows the label.
  update public.menu_items
     set label = 'Spaces', subheading = 'Run your community as a Space on Frequency'
   where menu_id = v_menu
     and href = '/spaces'
     and label = 'Spaces directory';

  -- ── 2. The directory row is added beside it, pointing at the PUBLIC directory ───────
  select category_id into v_cat
    from public.menu_items
   where menu_id = v_menu and href = '/spaces'
   limit 1;

  -- The two rows lead the panel, ahead of the persona doors, WITHOUT renumbering anything an
  -- operator arranged: take the first sibling's position and sit two and one before it. Reading
  -- order is `position` alone (lib/menus/read.ts), and a TIE is not ordered at all — so a naive
  -- "landing + 1" that collided with "For coaches and healers" at 0 would leave the panel's
  -- first two rows in whatever order the planner felt like. Distinct integers, deliberately.
  select coalesce(min(position), 0) into v_pos
    from public.menu_items
   where menu_id = v_menu
     and category_id is not distinct from v_cat
     and href not in ('/spaces', '/discover/spaces');

  if not exists (
    select 1 from public.menu_items where menu_id = v_menu and href = '/discover/spaces'
  ) then
    insert into public.menu_items
      (menu_id, category_id, label, href, subheading, position, col_span, mode, role_modes, min_access)
    values
      (v_menu, v_cat, 'Spaces directory', '/discover/spaces',
       'Browse every Space in the network', v_pos - 1, 1, 'active', '{}'::jsonb, 'visitor');
  end if;

  update public.menu_items
     set position = v_pos - 2
   where menu_id = v_menu and href = '/spaces';

  -- ── 3. The baseline stops carrying a default that no longer exists ──────────────────
  -- '/spaces/directory' left the code defaults in the same PR, so its presence in the
  -- inserts-only baseline can only mislead a future audit into reading a removed default as a
  -- deliberate operator delete. Both new hrefs are appended so the next sync sees no gap.
  -- Skipped while the baseline is still empty: empty means "first sync trusts the current
  -- state", and seeding it here would flip that sync into injecting every other absent default.
  update public.menus
     set synced_default_keys = (
           select coalesce(jsonb_agg(distinct k), '[]'::jsonb)
             from (
               select jsonb_array_elements_text(synced_default_keys) as k
                 from public.menus where id = v_menu
               union
               select unnest(array['/spaces', '/discover/spaces'])
             ) s
            where k <> '/spaces/directory'
         )
   where id = v_menu
     and synced_default_keys <> '[]'::jsonb;

  raise notice 'ADR-1113: header Spaces rows corrected.';
end $$;

-- Verify after (expect: 'Spaces' -> '/spaces' then 'Spaces directory' -> '/discover/spaces';
-- and no '/spaces/directory' key left in the baseline):
--   select mi.label, mi.href, mi.position
--     from public.menu_items mi join public.menus m on m.id = mi.menu_id
--    where m.surface_key = 'header' and mi.href in ('/spaces', '/discover/spaces')
--    order by mi.position;
--   select k from public.menus m, jsonb_array_elements_text(m.synced_default_keys) k
--    where m.surface_key = 'header' and k = '/spaces/directory';
