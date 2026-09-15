-- MENU CACHE: deploy after applying. The marketing surfaces are STATIC with
-- `revalidate = 3600` (app/(marketing)/layout.tsx deliberately avoids cookies()/getUser() so they
-- stay static), and raw SQL cannot call revalidatePath. So the public header served from the edge
-- keeps its six tabs for up to one hour after this runs, or until a deploy rebuilds those pages.
-- Bounded, not indefinite. Apply this WITH the deploy that carries the matching code defaults.
--
-- LIVE-250 / docs/CORE-MODEL.md §4 (ADR-1294): the public header goes from SIX tabs to FOUR.
-- Run ONCE against production. Idempotent: safe to re-run, and a no-op after the first run.
--
-- ── WHY THIS IS A DATA MIGRATION AND NOT JUST A CODE EDIT ────────────────────────────────
-- The live public header is DB ROWS. `menus` carries a `header` row (space_id IS NULL) with 6
-- categories and 24 items, and `lib/menus/read.ts` PREFERS those rows over the code defaults in
-- `lib/nav/registry.ts` (it falls back to code only when the surface has no rows at all). Editing
-- HEADER_TRIGGER_SEEDS alone therefore changes the fallback and moves nothing a visitor can see.
-- Measured 2026-09-15 before any change was made:
--   header  surface -> 6 categories (Home · Community · The Quest · The Lab · Spaces · About), 24 items
--   footer  surface -> 0 categories, 6 flat items (the six primary pages) -- UNTOUCHED by this file
--
-- ── WHAT CHANGES, AND WHAT DOES NOT ─────────────────────────────────────────────────────
--   1. The `Home` category and its one `/` item are DELETED. `/` is not lost: the header's own
--      wordmark links it (components/layout/marketing-header.tsx, `href={authed ? '/feed' : '/'}`),
--      and `/` keeps its flat footer link. A tab duplicating the brand mark costs a slot.
--   2. The `/the-lab` item MOVES into the About category, immediately after the `/about` row, and
--      the now-empty `The Lab` category is deleted. The Lab is not one of the four nouns, so it
--      reads as a row in the story panel. Its page, its footer link, its sitemap entry
--      (priority 0.8) and its llms.txt line are untouched.
--   3. `/` leaves `menus.synced_default_keys` for this surface, because it left the code defaults
--      in the same change. Left behind, the inserts-only sync (ADR-860) would read a REMOVED
--      default as a deliberate operator delete, and a future audit would read it as coverage.
--      `/the-lab` STAYS in the baseline: it is still a code default, just at a different level.
--   4. The About panel is renumbered ONLY enough to open a gap after `/about`; every other row
--      keeps its relative order, so an operator's arrangement survives. Reading order is
--      `position` alone (lib/menus/read.ts) and a TIE is not ordered at all, so the gap is opened
--      rather than the new row sharing a position with the one after it (the ADR-1118 lesson).
--
-- Verify BEFORE (expect 6 parentless categories, and `/` + `/the-lab` each alone in one):
--   select c.label, c.position, count(i.id) as items
--     from public.menus m
--     join public.menu_categories c on c.menu_id = m.id and c.parent_id is null
--     left join public.menu_items i on i.category_id = c.id
--    where m.surface_key = 'header' and m.space_id is null
--    group by c.label, c.position order by c.position;

do $$
declare
  v_menu     uuid;
  v_about    uuid;
  v_lab_cat  uuid;
  v_home_cat uuid;
  v_about_row_pos int;
begin
  select id into v_menu
    from public.menus
   where surface_key = 'header' and space_id is null
   limit 1;
  if v_menu is null then
    raise notice 'LIVE-250: header menu is not materialized in the DB; the code defaults already carry the four tabs. Nothing to do.';
    return;
  end if;

  -- ── 1. The About category, found by the row it CONTAINS, not by its label ──────────────
  -- The live label is an operator's to change ('Community' already differs from the code's
  -- 'The Community'); the destination is the contract. A category holding /about is the About
  -- panel whatever it is called.
  select c.id into v_about
    from public.menu_categories c
    join public.menu_items i on i.category_id = c.id
   where c.menu_id = v_menu and i.href = '/about'
   limit 1;
  if v_about is null then
    raise exception 'LIVE-250: no header category contains /about, so The Lab has nowhere to land. Refusing to delete its tab.';
  end if;

  -- ── 2. The Lab becomes a row in the About panel ────────────────────────────────────────
  select category_id into v_lab_cat
    from public.menu_items
   where menu_id = v_menu and href = '/the-lab'
   limit 1;

  if v_lab_cat is not null and v_lab_cat is distinct from v_about then
    -- Open a one-position gap after the /about row, preserving every relative order below it.
    select position into v_about_row_pos
      from public.menu_items
     where menu_id = v_menu and category_id = v_about and href = '/about'
     limit 1;

    -- Safe as a batch: `position` carries a plain index, not a unique constraint
    -- (supabase/migrations/20260721000000_menu_system.sql), so 1,2,3 -> 2,3,4 cannot collide.
    update public.menu_items
       set position = position + 1
     where menu_id = v_menu
       and category_id = v_about
       and position > v_about_row_pos;

    update public.menu_items
       set category_id = v_about,
           position = v_about_row_pos + 1,
           subheading = coalesce(subheading, 'The physical third space, and why a community needs a room')
     where menu_id = v_menu and href = '/the-lab';

    -- The emptied category goes. Guarded on emptiness and on having no child columns, so a
    -- re-run (or an operator who moved something else in there) never loses a row.
    if not exists (select 1 from public.menu_items where category_id = v_lab_cat)
       and not exists (select 1 from public.menu_categories where parent_id = v_lab_cat) then
      delete from public.menu_categories where id = v_lab_cat;
    end if;
  elsif v_lab_cat is null then
    raise notice 'LIVE-250: no /the-lab row in the live header (an operator removed it). Leaving the About panel alone.';
  end if;

  -- ── 3. The Home tab goes; `/` stays reachable via the wordmark and the footer ──────────
  select category_id into v_home_cat
    from public.menu_items
   where menu_id = v_menu and href = '/'
   limit 1;

  delete from public.menu_items where menu_id = v_menu and href = '/';

  if v_home_cat is not null
     and not exists (select 1 from public.menu_items where category_id = v_home_cat)
     and not exists (select 1 from public.menu_categories where parent_id = v_home_cat) then
    delete from public.menu_categories where id = v_home_cat;
  end if;

  -- ── 4. The sync baseline stops carrying a default that no longer exists ────────────────
  -- Skipped while the baseline is empty: empty means "the first sync trusts the current state",
  -- and seeding it here would flip that sync into injecting every other absent default.
  -- `as t(k)` is load-bearing: a bare `jsonb_array_elements_text(...) k` names the TABLE, so
  -- `jsonb_agg(distinct k)` would aggregate whole-row references and write [{"value":"/"}] back
  -- into the baseline. The explicit column alias keeps it a list of strings.
  update public.menus
     set synced_default_keys = (
           select coalesce(jsonb_agg(distinct t.k), '[]'::jsonb)
             from jsonb_array_elements_text(public.menus.synced_default_keys) as t(k)
            where t.k <> '/'
         )
   where id = v_menu
     and synced_default_keys <> '[]'::jsonb;

  raise notice 'LIVE-250: public header reduced to four tabs (The Lab folded into About, Home retired).';
end $$;

-- Verify AFTER (expect 4 parentless categories, and /the-lab sitting inside the About panel):
--   select c.label, c.position, count(i.id) as items
--     from public.menus m
--     join public.menu_categories c on c.menu_id = m.id and c.parent_id is null
--     left join public.menu_items i on i.category_id = c.id
--    where m.surface_key = 'header' and m.space_id is null
--    group by c.label, c.position order by c.position;
--   select i.label, i.href, i.position
--     from public.menu_items i join public.menus m on m.id = i.menu_id
--    where m.surface_key = 'header' and i.category_id = (
--            select c.id from public.menu_categories c
--              join public.menu_items x on x.category_id = c.id
--             where c.menu_id = m.id and x.href = '/about' limit 1)
--    order by i.position;
--   select count(*) from public.menu_items i join public.menus m on m.id = i.menu_id
--    where m.surface_key = 'header' and i.href = '/';   -- expect 0
--
-- ROLLBACK: re-materialize the two tabs from the code defaults at the time of this change.
--   -- 1. Home
--   -- insert into public.menu_categories (menu_id, label, position, min_access)
--   --   select id, 'Home', -1, 'visitor' from public.menus where surface_key='header' and space_id is null;
--   -- insert into public.menu_items (menu_id, category_id, label, href, position, col_span, mode, role_modes, min_access)
--   --   select m.id, c.id, 'Home', '/', 0, 1, 'active', '{}'::jsonb, 'visitor'
--   --     from public.menus m join public.menu_categories c on c.menu_id = m.id and c.label='Home'
--   --    where m.surface_key='header' and m.space_id is null;
--   -- 2. The Lab back out of the About panel into its own category (same shape, position 3).
--   -- 3. Re-add '/' to menus.synced_default_keys for the header surface.
