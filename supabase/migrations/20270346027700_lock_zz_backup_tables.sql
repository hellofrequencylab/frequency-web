-- SCAN-1190: five one-off rollback copies in `public` were readable by anyone with the anon key.
-- zz_backup_free_human_20261029, zz_backup_free_human_blocks_20261030, zz_backup_free_human_page_20261030,
-- zz_backup_free_human_pages_20261030 and zz_backup_alli_rae_update5_20261030 were made by hand-run SQL
-- with RLS off, so PostgREST served them to anon and authenticated (the Supabase linter's
-- rls_disabled_in_public ERROR). The older zz_backup_* copies already have RLS on and no grants.
-- This puts the five in the same state: RLS on, no policy, no anon or authenticated privileges.
-- Service role and the owner keep access, so the rollback copies stay usable.
-- Run ONCE against production. Idempotent: skips a table that is already gone.
do $$
declare t text;
begin
  foreach t in array array[
    'zz_backup_free_human_20261029',
    'zz_backup_free_human_blocks_20261030',
    'zz_backup_free_human_page_20261030',
    'zz_backup_free_human_pages_20261030',
    'zz_backup_alli_rae_update5_20261030'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;
-- Verify AFTER (expect zero rows):
--   select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
--    where n.nspname='public' and c.relkind='r' and c.relname like 'zz\_%'
--      and (not c.relrowsecurity or has_table_privilege('anon', c.oid, 'select'));
