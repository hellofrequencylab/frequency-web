-- SEC-015: explicit operator-only repair for the newly identified backup.
-- Requires authorization for the target database; not an automatic migration.
-- Target: Frequency Community (azsqfeonabsbmemvddqd).
-- Preserve all backups and operator/service-role access; do not read or change backup rows.
-- This table was created after the SEC-014 repair and requires separate containment.
-- This exact allowlist must not be widened without separately reviewing each new table.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '10s';
do $repair$
declare
  target_names text[] := array['zz_backup_alli_rae_update4_20261028'];
  backup record;
  column_list text;
  found_count integer := 0;
  missing_names text;
  protected_access_before jsonb;
  protected_access_after jsonb;
begin
  -- A silent no-op would look like a successful repair. Refuse if any exact target is absent
  -- or is not an ordinary public table, so operators can review drift before rerunning.
  select string_agg(target.name, ', ' order by target.name)
    into missing_names
    from unnest(target_names) as target(name)
   where not exists (
     select 1
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname = target.name
   );
  if missing_names is not null then
    raise exception 'SEC-015: expected ordinary public backup table(s) missing: %; rolling back', missing_names;
  end if;

  for backup in
    select c.oid, n.nspname, c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname = any(target_names)
    order by c.relname
  loop
    found_count := found_count + 1;
    -- Revoking PUBLIC can otherwise remove access inherited by the service role. Capture the
    -- operator and service-role effective rights and require the same rights before commit.
    select coalesce(jsonb_object_agg(access.role_name, access.privileges), '{}'::jsonb)
      into protected_access_before
      from (
        select roles.role_name,
               jsonb_build_object(
                 'table_select', has_table_privilege(roles.role_name, backup.oid, 'SELECT'),
                 'table_insert', has_table_privilege(roles.role_name, backup.oid, 'INSERT'),
                 'table_update', has_table_privilege(roles.role_name, backup.oid, 'UPDATE'),
                 'table_delete', has_table_privilege(roles.role_name, backup.oid, 'DELETE'),
                 'table_truncate', has_table_privilege(roles.role_name, backup.oid, 'TRUNCATE'),
                 'table_references', has_table_privilege(roles.role_name, backup.oid, 'REFERENCES'),
                 'table_trigger', has_table_privilege(roles.role_name, backup.oid, 'TRIGGER'),
                 'table_maintain', has_table_privilege(roles.role_name, backup.oid, 'MAINTAIN'),
                 'column_select', has_any_column_privilege(roles.role_name, backup.oid, 'SELECT'),
                 'column_insert', has_any_column_privilege(roles.role_name, backup.oid, 'INSERT'),
                 'column_update', has_any_column_privilege(roles.role_name, backup.oid, 'UPDATE'),
                 'column_references', has_any_column_privilege(roles.role_name, backup.oid, 'REFERENCES')
               ) as privileges
          from (
            select distinct role_name
              from unnest(array['service_role', current_user::text]) as protected_roles(role_name)
          ) as roles
      ) as access;

    execute format('alter table %I.%I enable row level security', backup.nspname, backup.relname);
    execute format('revoke all privileges on table %I.%I from public, anon, authenticated', backup.nspname, backup.relname);
    select string_agg(quote_ident(attname), ', ' order by attnum) into column_list
      from pg_attribute where attrelid = backup.oid and attnum > 0 and not attisdropped;
    if column_list is not null then
      execute format('revoke all privileges (%s) on table %I.%I from public, anon, authenticated', column_list, backup.nspname, backup.relname);
    end if;
    if not (select relrowsecurity from pg_class where oid = backup.oid) then
      raise exception 'SEC-015: RLS remains disabled on %; rolling back', backup.relname;
    end if;
    select coalesce(jsonb_object_agg(access.role_name, access.privileges), '{}'::jsonb)
      into protected_access_after
      from (
        select roles.role_name,
               jsonb_build_object(
                 'table_select', has_table_privilege(roles.role_name, backup.oid, 'SELECT'),
                 'table_insert', has_table_privilege(roles.role_name, backup.oid, 'INSERT'),
                 'table_update', has_table_privilege(roles.role_name, backup.oid, 'UPDATE'),
                 'table_delete', has_table_privilege(roles.role_name, backup.oid, 'DELETE'),
                 'table_truncate', has_table_privilege(roles.role_name, backup.oid, 'TRUNCATE'),
                 'table_references', has_table_privilege(roles.role_name, backup.oid, 'REFERENCES'),
                 'table_trigger', has_table_privilege(roles.role_name, backup.oid, 'TRIGGER'),
                 'table_maintain', has_table_privilege(roles.role_name, backup.oid, 'MAINTAIN'),
                 'column_select', has_any_column_privilege(roles.role_name, backup.oid, 'SELECT'),
                 'column_insert', has_any_column_privilege(roles.role_name, backup.oid, 'INSERT'),
                 'column_update', has_any_column_privilege(roles.role_name, backup.oid, 'UPDATE'),
                 'column_references', has_any_column_privilege(roles.role_name, backup.oid, 'REFERENCES')
               ) as privileges
          from (
            select distinct role_name
              from unnest(array['service_role', current_user::text]) as protected_roles(role_name)
          ) as roles
      ) as access;
    if protected_access_after is distinct from protected_access_before then
      raise exception 'SEC-015: service-role or operator access changed on %; rolling back', backup.relname;
    end if;
    if exists (
      select 1
        from pg_roles r
       where r.rolname in ('anon', 'authenticated')
         and (
           has_table_privilege(r.rolname, backup.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
           or has_any_column_privilege(r.rolname, backup.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
         )
    ) then
      raise exception 'SEC-015: browser table or column privileges remain on %; rolling back', backup.relname;
    end if;
  end loop;

  if found_count <> cardinality(target_names) then
    raise exception 'SEC-015: repaired % of % expected backups; rolling back', found_count, cardinality(target_names);
  end if;
end
$repair$;
commit;
