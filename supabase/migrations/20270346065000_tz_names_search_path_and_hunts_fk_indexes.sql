-- SCAN-1238: two of the three small database advisor leftovers. The third (six zz_backup_ tables) is NOT here.
--
-- 1. private.tz_names() gets a pinned search_path (advisor: function_search_path_mutable).
--    The function is a literal list of IANA zone names (20270346028100) and names no object at all, so an empty
--    search_path changes nothing it reads. ONE REAL TRADE: Postgres does not inline a SQL function that carries a
--    SET clause, so the five event RPCs that read it (public_organizer_events, density_by_city,
--    event_calendar_feed, public_calendar_feed, space_public_calendar_feed) now pay one function scan of about 600
--    literal rows per call in place of an inlined VALUES list. Each reads it once, inside a MATERIALIZED CTE, so
--    the cost is one scan per call and not one per event row. This was NOT measured before it was written (the
--    change cannot be tried on production without applying it); after it is applied, `explain analyze` one of
--    those RPCs and compare with the 2.7 ms the 028100 header records. If it matters, the rollback is one line.
--
-- 2. Three composite foreign keys on the Hunts tables get an index on their own columns, in key order
--    (advisor: unindexed_foreign_keys, read from pg_constraint against pg_index on production, 2026-11-16):
--      hunt_missions            (version_id, hunt_id)        -> hunt_versions (id, hunt_id)
--      hunt_rule_group_members  (group_id, version_id)       -> hunt_rule_groups (id, version_id)
--      hunts                    (id, current_version_id)     -> hunt_versions (hunt_id, id)
--    Each already had an index LEADING with the first column (which is why `pnpm check:fk-indexes` never flagged
--    them), so these are narrow: they let the cascade from hunt_versions / hunt_rule_groups match both columns
--    from the index. Tables only, no switch, no function and no policy on Hunts is touched.
--    Plain `create index if not exists` inside the transaction: the Hunts tables are small and new, and a
--    CONCURRENTLY build cannot run in a migration transaction.
--
-- NOT DONE HERE, ON PURPOSE: the six public.zz_backup_* tables (zz_backup_free_human_heroes_20261103,
-- zz_backup_free_human_page_20261030, zz_backup_danieltyack_newworld_20261103,
-- zz_backup_danieltyack_nwblocks_20261103, zz_backup_free_human_blocks_20261030,
-- zz_backup_free_human_pages_20261030) stay. Removing them is a destructive change that waits for the owner to
-- confirm the Free Human and Daniel Space pages no longer need them, so SCAN-1238 stays open on that part.
--
-- Additive and idempotent. ROLLBACK: `alter function private.tz_names() reset search_path;` and drop the three
-- indexes by name.

begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

alter function private.tz_names() set search_path = '';

create index if not exists hunt_missions_version_hunt_idx
  on public.hunt_missions (version_id, hunt_id);

create index if not exists hunt_rule_group_members_group_version_idx
  on public.hunt_rule_group_members (group_id, version_id);

create index if not exists hunts_id_current_version_idx
  on public.hunts (id, current_version_id);

commit;
