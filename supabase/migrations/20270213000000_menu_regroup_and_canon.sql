-- ── The 2026-08-06 menu regroup, applied to the seeded menus ────────────────────────────────
--
-- The live `left` and `header` surfaces are SEEDED, so the database owns the rail's grouping,
-- order and labels — a code change to lib/nav-areas.ts does not move a seeded row. The same
-- pass that regroups the code default therefore has to regroup the data, or the two disagree
-- and only one of them is what members see. (docs/MENU-AUDIT-2026-08-06.md §4.1.)
--
-- WHAT THIS DOES NOT DO: touch a single gate column. Permissions stopped being data in this
-- pass — lib/menus/gates.ts re-derives min_access / staff_domain / staff_level from the code
-- registry at read time, so the six admin rows that lost their staff domain and the Admin row
-- seeded at 'visitor' are already fixed, in code, for every environment at once. Rewriting the
-- stored columns here would just be writing values nothing reads.
--
-- IDEMPOTENT throughout: every statement is a no-op on a second run, and every one is scoped by
-- href so it cannot touch a row an operator has since repointed. Safe on an unseeded database
-- too (no `menus` row ⇒ every statement matches nothing).

-- ── 1 · The header: the naming canon ────────────────────────────────────────────────────────
-- docs/NAMING.md is explicit and locked: "The SEVEN topics are Channels, never 'Interests'" and
-- "'Interests' is RETIRED as a member-facing word for these." The live dropdown said Interests.
-- The code default has always said Channels; this brings the seeded copy back in line.
update public.menu_items i
   set label = 'Channels'
  from public.menus m
 where i.menu_id = m.id
   and m.surface_key = 'header'
   and m.space_id is null
   and i.href = '/discover/topics'
   and i.label = 'Interests';

-- ── 2 · The header: /spaces is reachable again ──────────────────────────────────────────────
-- A trigger that opens a panel carries no href of its own (components/layout/mega-menu.tsx
-- buildTriggers), so the Spaces landing is only reachable from a row INSIDE the panel. The seed
-- had no such row, which left /spaces unreachable from the header entirely (audit §3 finding 3).
-- Inserted at position -1 so it leads the panel without renumbering the operator's other rows.
insert into public.menu_items (menu_id, category_id, label, href, subheading, position, min_access, mode)
select m.id, c.id, 'Spaces directory', '/spaces',
       'Browse every Space in the network', -1, 'visitor', 'active'
  from public.menus m
  join public.menu_categories c on c.menu_id = m.id and c.label = 'Spaces'
 where m.surface_key = 'header'
   and m.space_id is null
   and not exists (
     select 1 from public.menu_items x
      where x.menu_id = m.id and x.href = '/spaces'
   );

-- ── 3 · The left rail: commerce gets its own group ──────────────────────────────────────────
-- "Community" was eleven rows holding three unrelated things: places to gather, commerce, and
-- people (audit §4.5). Market / Housing / Frequency Store move to a **Market** group, matching
-- the code default's new shape (lib/verticals/*.ts `section: 'Market'`).
insert into public.menu_categories (menu_id, label, position, min_access)
select m.id, 'Market', 1, 'visitor'
  from public.menus m
 where m.surface_key = 'left'
   and m.space_id is null
   and not exists (
     select 1 from public.menu_categories c
      where c.menu_id = m.id and c.label = 'Market'
   );

-- The Quest and Admin shift down one so Market lands between Community and The Quest.
update public.menu_categories c
   set position = c.position + 1
  from public.menus m
 where c.menu_id = m.id
   and m.surface_key = 'left'
   and m.space_id is null
   and c.label in ('The Quest', 'Admin')
   and c.position < 2;

update public.menu_items i
   set category_id = (
         select c.id from public.menu_categories c
          where c.menu_id = i.menu_id and c.label = 'Market' limit 1
       ),
       position = case i.href when '/marketplace' then 0 when '/housing' then 1 else 2 end
  from public.menus m
 where i.menu_id = m.id
   and m.surface_key = 'left'
   and m.space_id is null
   and i.href in ('/marketplace', '/housing', '/store');

-- ── 4 · The left rail: two rows move into My Frequency ──────────────────────────────────────
-- My Contacts is a TAB of the Members hub and was rendered as its sibling — and because
-- routeActive prefix-matches, standing on /network/contacts lit BOTH rows at once. Journal is
-- filed under "You" by DAWN's three-docks card, not under the game. Both now render inside the
-- My Frequency disclosure (components/layout/my-frequency-row.tsx), and both are still in ⌘K.
--
-- SWITCHED OFF, NOT DELETED. `mode = 'hidden'` is the same switch the Menu Manager's on/off
-- toggle writes, so this is reversible in the UI in one click if the owner wants either row
-- back in the rail while testing layouts. A delete would not be.
update public.menu_items i
   set mode = 'hidden'
  from public.menus m
 where i.menu_id = m.id
   and m.surface_key = 'left'
   and m.space_id is null
   and i.href in ('/network/contacts', '/journal')
   and i.mode = 'active';
