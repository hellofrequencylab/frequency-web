-- SCAN-1238: drop six one-off rollback copies left in `public`. Each was made by hand-run SQL
-- (`create table ... as select`) before a Space website or page edit, so none has a primary key,
-- which is what the Supabase advisor (no_primary_key) reported on 2026-11-16:
--   zz_backup_free_human_page_20261030, zz_backup_free_human_blocks_20261030,
--   zz_backup_free_human_pages_20261030, zz_backup_free_human_heroes_20261103,
--   zz_backup_danieltyack_newworld_20261103, zz_backup_danieltyack_nwblocks_20261103.
-- The owner confirmed on 2026-11-16 that the Free Human and Daniel Space pages no longer need them:
-- drop now, no export.
--
-- Read from the live catalog on 2026-11-16 before writing this: each table holds one row, RLS is on,
-- and nothing depends on any of them (no constraint, index, foreign key in or out, policy, trigger,
-- publication, inheritance, view, or function body). So these are plain drops with no CASCADE: if a
-- dependency has appeared since, the statement fails and the whole migration rolls back.
-- The thirteen other zz_backup_ tables are NOT touched here.
--
-- Destructive and idempotent (a table that is already gone is skipped). ROLLBACK: none from this
-- file; the rows are recoverable only from a database backup taken before the apply.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '60s';

drop table if exists public.zz_backup_free_human_page_20261030;
drop table if exists public.zz_backup_free_human_blocks_20261030;
drop table if exists public.zz_backup_free_human_pages_20261030;
drop table if exists public.zz_backup_free_human_heroes_20261103;
drop table if exists public.zz_backup_danieltyack_newworld_20261103;
drop table if exists public.zz_backup_danieltyack_nwblocks_20261103;

commit;
