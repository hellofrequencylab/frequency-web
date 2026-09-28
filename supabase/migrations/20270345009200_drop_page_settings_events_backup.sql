-- The ADR-1316 snapshot table is dropped, on the owner's ruling (HYG-123, ADR-1546).
--
-- WHAT IT WAS. `public.page_settings_events_backup_20260910` held the 21 per-page /events layout
-- rows that scripts/adr-1316-events-page-settings-cleanup.sql retired on 2026-09-10: the only way
-- back from that cleanup. 20270345003500 (HYG-086) turned RLS on with no policy so nobody but the
-- service role could read it, and dated the drop for on or after 2026-10-10. Four rows then handed
-- that date to one another (LIVE-288, HYG-086, HYG-087, SCAN-640) and all four closed, so nothing
-- open carried the day it came due. HYG-123 filed that gap and asked the owner.
--
-- 🔴 THE RULING (2026-09-28, ADR-1535 §6): "HYG-123: drop it." No archive copy is taken: the 21
-- rows are the way back and the owner chose not to keep it. Re-tested on production before this
-- was written: the table exists, holds 21 rows, RLS on, zero policies, zero constraints, zero
-- dependent views, and still carries all seven default anon privileges (the one exception to
-- 20270218000000's close of default grants on internal tables). The drop takes the grants with it.
--
-- ⚠️ GUARDED, because the table is in no migration. It was created by a script, so a fresh
-- environment (db reset, a branch database, the fresh-apply suite that db-tests runs) has no such
-- table and a bare DROP TABLE would abort the replay. Same reason 20270345003500 guards its ALTER
-- with to_regclass. `if exists` is the guard; the do-block below is the proof that it worked.
--
-- 🔴 APPLIED TO PRODUCTION by execute_sql, then an explicit ledger row at this file's own version;
-- never `db push`, never `apply_migration` (docs/DATABASE.md). Once applied, the advisor's
-- no_primary_key finding on this table goes with it, and docs/proposals/SCAN-640 (a primary key
-- for a dropped table) is deleted in the same change.
--
-- ROLLBACK: there is none. The rows are gone by decision, not by accident.

begin;

drop table if exists public.page_settings_events_backup_20260910;

-- PROVE IT. A drop that a fresh environment cannot run is not a drop, and a drop that left the
-- relation behind is not one either. This passes on production (the table is gone) and on a fresh
-- database (it never existed), which is the whole point of the guard above. The lookup goes
-- through pg_class rather than to_regclass on purpose: HYG-123's probe accepts to_regclass
-- anywhere in the file as the guard, and a proof that spelled it would let an unguarded DROP pass.
do $$
begin
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'page_settings_events_backup_20260910'
  ) then
    raise exception 'page_settings_events_backup_20260910 still exists after the drop';
  end if;
end $$;

commit;
