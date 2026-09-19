-- SCAN-640 / ADR-1446: drop the ADR-1316 events page-settings snapshot.
--
-- scripts/adr-1316-events-page-settings-cleanup.sql created
-- page_settings_events_backup_20260910 on 2026-09-10 as the only way back for
-- the 21 per-page /events layout rows it retired. HYG-086 enabled RLS
-- (20270345003500) so it is not an open read. The advisor still reports
-- no_primary_key INFO because the snapshot was CREATE TABLE AS with no PK.
--
-- WHAT THIS DOES. Drops the snapshot if it exists AND is empty.
-- A production apply against a non-empty table raises and does not drop.
-- That is the row's "count is 0 or archived off-public" rule, encoded so a
-- premature apply cannot destroy the recovery. HYG-086 also dated a drop
-- on or after 2026-10-10; an empty table may go earlier.
--
-- WHAT THIS DOES NOT DO. It does not apply itself. Draft-and-approve:
-- execute_sql the file, then insert supabase_migrations.schema_migrations
-- at version 20270345006600. Never apply_migration. Never db push.
--
-- Fresh environments (db reset, CI) never had this table (it is not in any
-- creating migration), so both statements no-op.
--
-- Version 06600 because 06300 is HYG-068, 06400 is HYG-078, and 06500 is SCAN-638.

do $$
declare
  n bigint;
begin
  if to_regclass('public.page_settings_events_backup_20260910') is null then
    return;
  end if;
  select count(*) into n from public.page_settings_events_backup_20260910;
  if n > 0 then
    raise exception
      'SCAN-640 refused: public.page_settings_events_backup_20260910 has % rows. Archive them off-public or wait until 2026-10-10 (HYG-086).',
      n;
  end if;
end $$;

drop table if exists public.page_settings_events_backup_20260910;
