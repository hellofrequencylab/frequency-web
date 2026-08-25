-- Meta-scan DB hygiene (owner-approved). Retire orphaned relations + functions.
--
-- Every item was verified before dropping: 0 code references (.from / .rpc), 0 incoming
-- foreign keys, 0 triggers, 0 RLS-policy dependencies, and 0 other-function-body callers
-- (checked via pg_policies + pg_proc.prosrc with word-boundary matches). Tables were empty
-- except menu_config (25 legacy rows, superseded by the menu_system tables — read by no
-- code). Applied to prod via MCP and version-reconciled to this filename.
--
-- NOT dropped here (needs code sequencing first): commerce_variants still has a FK from
-- commerce_order_items.variant_id and a (null-only) code write in lib/billing/checkout.ts;
-- drop the write + column, deploy, THEN drop the table.
--
-- ⚠️ AMENDED 2026-08-25 (SCAN-508, ADR-1144). `listing_saves` — the third table in the list below —
-- was RESTORED to production on 2026-08-25 (20270327000000_restore_listing_saves.sql). That file's
-- header asks why, and asks whether this migration's retirement claim needs retracting. The answers,
-- established from git history after deepening a shallow clone:
--
-- ✅ THE CLAIM ABOVE WAS TRUE WHEN IT WAS WRITTEN, AND DOES NOT NEED RETRACTING. This migration
-- landed 2026-07-07 (#1606). `lib/listings/index.ts` gained its four `.from('listing_saves')` sites
-- — saveListing, unsaveListing, listSavedListingIds, listSavedListings — on 2026-07-27 (#1967),
-- TWENTY DAYS LATER. There were no code references on the day they were counted.
--
-- 🔴 SO THE DEFECT IS THE OPPOSITE OF A BAD RETIREMENT: a feature was built against a table that had
-- already been dropped, and it therefore NEVER WORKED. Not "worked, then broke" — the save heart on
-- /housing flipped on click and silently reset on reload from the day it shipped. That is also why
-- the restored table holds zero rows.
--
-- WHY NOTHING CAUGHT IT, which is the part worth carrying forward, because both halves are still
-- true of every other table this module touches:
--   1. IT COMPILED. `db()` in lib/listings/index.ts returns `createAdminClient()` typed as a bare
--      `SupabaseClient`, with no `Database` generic. The generated types in lib/database.types.ts
--      were CORRECT — they did not carry listing_saves, because it had been dropped — but an untyped
--      handle never consults them. A typed client would have failed the build that introduced it.
--   2. IT WAS SILENT. The writes discarded their error and the reads fell back to an empty set, so a
--      table that did not exist produced no error, no log line and no failing test. The saves tests
--      mock the Supabase client, so they never touch a table either way.
-- Half of that is now fixed: #2288 made saveListing/unsaveListing THROW, so the button's optimistic
-- flip reverts instead of lying. The untyped `db()` handle is unchanged and is the general hazard.
--
-- NOTHING BELOW IS CHANGED, and nothing below should be. This file describes an apply that already
-- happened and was correct on its own terms; the restore lives in its own higher-versioned file.
-- ✅ THE OTHER FIVE TABLES WERE RE-CHECKED ON 2026-08-25 and remain correctly retired: circle_topics,
-- menu_config, library_renditions, library_usages and conversation_room_migration have ZERO
-- `.from(...)` or `.rpc(...)` call sites across app/, lib/ and components/. The only mentions left
-- are comments explaining the retirement, and `lib/menu-config.ts` — named in one of them — no
-- longer exists.

drop table if exists public.circle_topics cascade;
drop table if exists public.menu_config cascade;
drop table if exists public.listing_saves cascade;
drop table if exists public.library_renditions cascade;
drop table if exists public.library_usages cascade;
drop table if exists public.conversation_room_migration cascade;

drop function if exists public.are_friends(uuid, uuid);
drop function if exists public.get_my_circle_id();
drop function if exists public.get_my_hub_id();
drop function if exists public.get_my_nexus_id();
drop function if exists public.get_my_outpost_id();
drop function if exists public.housing_rentals_near(numeric, numeric, integer, integer);
