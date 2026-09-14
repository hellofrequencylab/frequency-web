-- The ADR-1316 snapshot table gets row level security, and a retirement date.
--
-- scripts/adr-1316-events-page-settings-cleanup.sql created page_settings_events_backup_20260910
-- on 2026-09-10 as the only way back for the 21 per-page /events layout rows it retired (nine
-- deleted; page_settings has no soft-delete and no trigger, so the snapshot was the whole safety
-- net). That was right. It was also created by a script rather than a migration, with no RLS and no
-- policy, so the Supabase security advisor has reported it as the project's second
-- rls_disabled_in_public ERROR on every run since (the first, spatial_ref_sys, is the accepted
-- PostGIS exception). HYG-086.
--
-- WHAT THIS DOES. Enables row level security on the snapshot if it exists, and nothing else.
-- With RLS on and no policy, every direct client read fail-closes; the service role still reads
-- it, which is the only reader a restore would ever use. Nothing in the app reads this table.
--
-- WHAT THIS DOES NOT DO. It does not drop the table. ADR-1316's cleanup was executed 2026-09-10;
-- the snapshot is kept 30 days beyond that, so a drop is a SEPARATE migration on or after
-- 2026-10-10, once nobody has needed the way back. The backlog row carries that date.
--
-- `if exists` on purpose: the table is not in any migration, so a fresh environment (db reset,
-- a branch database, CI's fresh-apply suite) never has it and this file must be a no-op there.

do $$
begin
  if to_regclass('public.page_settings_events_backup_20260910') is not null then
    execute 'alter table public.page_settings_events_backup_20260910 enable row level security';
    execute 'comment on table public.page_settings_events_backup_20260910 is '
      || quote_literal('ADR-1316 snapshot of the 21 per-page /events layout rows taken 2026-09-10 before the cleanup. RLS on, no policy: service-role only. Drop on or after 2026-10-10 (HYG-086).');
  end if;
end $$;
