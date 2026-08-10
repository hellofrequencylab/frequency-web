-- MENU CACHE: this migration writes seeded menu data. Raw SQL cannot call revalidatePath, and
-- app/(marketing)/layout.tsx reads getMenu('header')/getMenu('footer') while deliberately avoiding
-- cookies()/getUser() so those pages stay STATIC with revalidate = 3600. So the marketing surfaces
-- keep serving the OLD rail for up to an hour after this applies, unless a deploy rebuilds them
-- first. The in-app (main) layout is request-time and picks the change up immediately.
--
-- After applying: deploy, or touch any menu in Menu Manager to fire revalidatePath('/', 'layout').
-- Enforced by `pnpm check:migrations` (ADR-973).

-- ── The rail's Profile row points at the profile, not at the profile editor ──────────────────
--
-- /profile now exists as a real route (app/(main)/profile/page.tsx): a per-session redirect to
-- /people/<the member's handle>. Before it existed there was no href that could mean "my
-- profile" — a menu row is one static value served to everybody — so the row was pointed at
-- /settings/profile, which is the EDITOR. Members clicking "Profile" landed in a settings form.
--
-- The code default moved with the route (lib/menus/defaults.ts), but the `left` surface is
-- SEEDED, so the database owns what the rail actually renders and a code change alone would
-- not move this row. Same lesson as 20270213000000: fix both or only one of them is live.
--
-- IDEMPOTENT and SCOPED BY BOTH href AND label: a second run matches nothing, and a row an
-- operator has since repointed or renamed is left alone rather than silently reclaimed.
update public.menu_items i
   set href = '/profile'
  from public.menus m
 where i.menu_id = m.id
   and m.surface_key = 'left'
   and m.space_id is null
   and i.href = '/settings/profile'
   and i.label = 'Profile';

-- The same row, wherever else an operator has already placed a member-facing "Profile" link.
-- The profile dropdown is the other surface a Profile row belongs on; scoped identically so
-- it cannot touch the Settings link that legitimately points at the editor.
update public.menu_items i
   set href = '/profile'
  from public.menus m
 where i.menu_id = m.id
   and m.surface_key = 'profile'
   and m.space_id is null
   and i.href = '/settings/profile'
   and i.label = 'Profile';
