-- SCAN-640 (ADR-1461): give page_settings_events_backup_20260910 a primary key.
--
-- FOUND 2026-09-19. Advisor no_primary_key INFO on the ADR-1316 snapshot table.
-- RLS landed in 20270345003500 (HYG-086), so this is not an open read. That file
-- also dated the DROP for on or after 2026-10-10, 30 days after the 2026-09-10
-- cleanup. Today is 2026-09-19. Dropping now throws away the only way back for
-- the 21 retired /events page_settings rows.
--
-- PREMISE RE-TESTED 2026-09-19 on this tree: no later migration mentions the
-- table; no migration adds a primary key; the original SCAN-640 probe (a DROP
-- file) still fails, correctly. Production count was not readable from this
-- session (no Supabase credentials). The snapshot is CREATE TABLE AS SELECT,
-- so Postgres copied columns without NOT NULL or a key.
--
-- WHAT THIS DOES. If the snapshot exists and still has no primary key, add one.
-- Prefer the source key (space_id, route) when every row can carry it. If any
-- key is null or duplicated, fall back to a surrogate identity so the advisor
-- still clears. `if exists` / early return on purpose: the table is not in any
-- creating migration, so a fresh environment never has it.
--
-- WHAT THIS DOES NOT DO. It does not drop the table. HYG-086 still owns that
-- date. Draft only. The row and the 2026-09-19 slate forbid apply_migration
-- and DDL execute_sql from an agent session. Owner applies later: execute_sql,
-- then insert supabase_migrations.schema_migrations at version 20270345006500.
--
-- House style: additive + idempotent. SAFE to re-run. No em dashes.
--
-- ROLLBACK:
--   alter table if exists public.page_settings_events_backup_20260910
--     drop constraint if exists page_settings_events_backup_20260910_pkey;
--   alter table if exists public.page_settings_events_backup_20260910
--     drop column if exists id;

do $$
declare
  n_null bigint;
  n_dup bigint;
begin
  if to_regclass('public.page_settings_events_backup_20260910') is null then
    return;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.page_settings_events_backup_20260910'::regclass
      and contype = 'p'
  ) then
    return;
  end if;

  execute $sql$
    select count(*)
    from public.page_settings_events_backup_20260910
    where space_id is null or route is null
  $sql$ into n_null;

  execute $sql$
    select count(*) from (
      select 1
      from public.page_settings_events_backup_20260910
      group by space_id, route
      having count(*) > 1
    ) d
  $sql$ into n_dup;

  if n_null = 0 and n_dup = 0 then
    execute $sql$
      alter table public.page_settings_events_backup_20260910
        alter column space_id set not null,
        alter column route set not null
    $sql$;
    execute $sql$
      alter table public.page_settings_events_backup_20260910
        add primary key (space_id, route)
    $sql$;
  else
    execute $sql$
      alter table public.page_settings_events_backup_20260910
        add column id bigint generated always as identity primary key
    $sql$;
  end if;
end $$;
