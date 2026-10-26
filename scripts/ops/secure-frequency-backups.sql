-- SEC-002: explicit operator-only repair for the two named operational backups.
-- Requires authorization for the target database; not an automatic migration.
-- Target: Frequency Community (azsqfeonabsbmemvddqd).
-- Preserve both backups and operator/service-role access; do not read or change backup rows.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '10s';
do $repair$
declare
  backup record;
  column_list text;
begin
  for backup in
    select c.oid, n.nspname, c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname in ('zz_backup_temple_home_20261022', 'zz_backup_group_event_owner_20261020')
  loop
    execute format('alter table %I.%I enable row level security', backup.nspname, backup.relname);
    execute format('revoke all privileges on table %I.%I from public, anon, authenticated', backup.nspname, backup.relname);
    select string_agg(quote_ident(attname), ', ' order by attnum) into column_list
      from pg_attribute where attrelid = backup.oid and attnum > 0 and not attisdropped;
    if column_list is not null then
      execute format('revoke all privileges (%s) on table %I.%I from public, anon, authenticated', column_list, backup.nspname, backup.relname);
    end if;
    if exists (
      select 1 from pg_roles r where r.rolname in ('anon', 'authenticated')
        and (has_table_privilege(r.rolname, backup.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          or has_any_column_privilege(r.rolname, backup.oid, 'SELECT,INSERT,UPDATE,REFERENCES'))
    ) then
      raise exception 'SEC-002: browser privileges remain on %; rolling back', backup.relname;
    end if;
  end loop;
end
$repair$;
commit;
