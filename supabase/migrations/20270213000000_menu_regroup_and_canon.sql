-- MENU CACHE: this migration writes seeded menu data. Raw SQL cannot call revalidatePath, and
-- app/(marketing)/layout.tsx reads getMenu('header')/getMenu('footer') while deliberately avoiding
-- cookies()/getUser() so those pages stay STATIC with revalidate = 3600. So the marketing surfaces
-- keep serving the OLD rail for up to an hour after this applies, unless a deploy rebuilds them
-- first. The in-app (main) layout is request-time and picks the change up immediately.
--
-- After applying: deploy, or touch any menu in Menu Manager to fire revalidatePath('/', 'layout').
-- Enforced by `pnpm check:migrations` (ADR-973).

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
--
-- 🔴 SET, DO NOT INCREMENT. The first version of this was `position + 1 ... where position < 2`,
-- where the `< 2` was meant as idempotency protection. It was not: the seeded Admin group was
-- ALREADY at 2, so it never moved while The Quest went 1 -> 2, and the two collided at the same
-- position with a non-deterministic order between them. Caught on the live database by the
-- post-apply verification, not by anything in this file.
--
-- Absolute positions are the fix AND the idempotency: running this twice lands on the same four
-- numbers, whatever the rows started at, which an increment can never promise.
update public.menu_categories c
   set position = case c.label
                    when 'Community' then 0
                    when 'Market'    then 1
                    when 'The Quest' then 2
                    when 'Admin'     then 3
                  end
  from public.menus m
 where c.menu_id = m.id
   and m.surface_key = 'left'
   and m.space_id is null
   and c.label in ('Community', 'Market', 'The Quest', 'Admin');

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
-- My Frequency disclosure (components/layout/my-frequency-menu.tsx), and both are still in ⌘K.
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

-- ── 5 · The left rail: two rows both called "Market" ────────────────────────────────────────
-- The member commerce row (/marketplace) and the operator board (/admin/marketplace) were both
-- labelled "Market". In an open rail the section header was the only thing telling them apart;
-- in a FOLDED rail there are no section headers at all, so the two were indistinguishable.
-- The code default now says "Market admin" (lib/nav-areas.ts); this matches the seeded row.
update public.menu_items i
   set label = 'Market admin'
  from public.menus m
 where i.menu_id = m.id
   and m.surface_key = 'left'
   and m.space_id is null
   and i.href = '/admin/marketplace'
   and i.label = 'Market';

-- ── 6 · The header: Partners comes back ─────────────────────────────────────────────────────
-- /discover/partners is a live page and a code-default member of the Community dropdown, but
-- the seeded row was `mode = 'hidden'`, so the panel had silently lost it. Restored to match
-- the code default. If it was hidden on purpose, one click in the Menu Manager puts it back.
update public.menu_items i
   set mode = 'active'
  from public.menus m
 where i.menu_id = m.id
   and m.surface_key = 'header'
   and m.space_id is null
   and i.href = '/discover/partners'
   and i.mode = 'hidden';

-- ── 7 · The header: sentence case ───────────────────────────────────────────────────────────
-- "Business Pricing" was the one title-cased label among sentence-cased siblings ("For coaches
-- and healers", "Help center"). docs/CONTENT-VOICE.md: plain sentences.
update public.menu_items i
   set label = 'Business pricing'
  from public.menus m
 where i.menu_id = m.id
   and m.surface_key = 'header'
   and m.space_id is null
   and i.href = '/pricing'
   and i.label = 'Business Pricing';
