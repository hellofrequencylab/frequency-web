-- Remove the inert `area_permissions` rows whose nav key no longer exists (ADR-850).
--
-- WHAT THESE ROWS ARE. `/admin/roles` lets an operator override a nav area's access floor; the
-- override persists here keyed by `NavArea.key`. `lib/permissions.ts` reads them back and DROPS any
-- row whose `area_key` is not in `NAV_AREA_DEFAULTS`:
--
--     if (row.area_key in NAV_AREA_DEFAULTS && VALID.has(row.min_role as NavAccess)) { ... }
--
-- So a row for a key that has since been renamed or retired is silently ignored. It is not a bug in
-- the reader (dropping an unknown key is the fail-safe), but it does mean an operator can set an
-- override, see it saved, and have it never apply.
--
-- WHAT WAS FOUND. An audit of the 9 live rows against the current catalog found exactly two
-- orphans, both set deliberately by the owner and both inert since the day they were written:
--
--     area_key = 'messages'   min_role = 'crew'    set 2026-06-06
--     area_key = 'settings'   min_role = 'crew'    set 2026-06-10
--
-- `messages` was presumably meant for the Message Boards area, whose key is `messageBoards` (the
-- href is /messages, which is the likely source of the confusion). `settings` matches the Personal
-- Settings area that was deliberately removed from the Admin section: every logged-in member
-- reaches it from the profile card, so it is no longer a gateable nav area at all.
--
-- WHY DELETE RATHER THAN REMAP. Remapping 'messages' to 'messageBoards' would ACTIVATE an override
-- that has never been in force: `messageBoards` defaults to 'member' and 'crew' is one rung above
-- it, so the remap would quietly TIGHTEN access for real members based on a two-month-old row whose
-- intent cannot be confirmed. Changing live access is not a cleanup. Deleting an inert row changes
-- nothing today and removes a latent trap: if a future nav area were ever keyed 'messages' or
-- 'settings', these stale rows would silently take effect on it.
--
-- The other 7 rows are valid keys and are LEFT ALONE, including the four operator overrides that
-- are actively in force (admin-growth, admin-operations, admin-vera-ai at 'mentor';
-- admin-programs at 'guide').
--
-- REVERSIBLE. To restore:
--   insert into public.area_permissions (area_key, min_role) values ('messages','crew'), ('settings','crew');
--
-- Idempotent: a second run deletes nothing.

delete from public.area_permissions
where area_key in ('messages', 'settings');

comment on table public.area_permissions is
  'Operator overrides for nav-area access floors, keyed by NavArea.key (lib/nav-areas.ts). A row whose key is not in the current catalog is IGNORED by lib/permissions.ts, so a renamed or retired area leaves an inert row behind; prune those rather than remapping them, since a remap activates an override that was never in force (ADR-850).';
