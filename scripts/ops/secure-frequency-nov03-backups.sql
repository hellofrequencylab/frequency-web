-- SEC-023: permission-only containment for exactly four November 3 backups.
-- Operator-only, NOT an automatic migration. Target: Frequency Community (azsqfeonabsbmemvddqd).
-- Daniel runs this only after this exact file is on main and the target project is verified.
-- No rows are read, copied, changed, or deleted. Do not broaden this allowlist.
-- The transaction fails closed on missing targets, existing RLS/policies, privilege drift,
-- or remaining browser access. A second execution is refused by the RLS precondition.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '10s';
do $repair$
declare
  target_names text[] := array[
    'zz_backup_danieltyack_newworld_20261103',
    'zz_backup_danieltyack_nwblocks_20261103',
    'zz_backup_free_human_heroes_20261103',
    'zz_backup_vanta_20261103'
  ];
  backup record;
  column_list text;
  found_count integer := 0;
  missing_names text;
  table_before jsonb;
  table_after jsonb;
  column_before jsonb;
  column_after jsonb;
begin
  select string_agg(target.name, ', ' order by target.name) into missing_names
  from unnest(target_names) as target(name)
  where not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname = target.name);
  if missing_names is not null then
    raise exception 'SEC-023: expected ordinary public backup tables missing: %; rolling back', missing_names;
  end if;
  -- RLS must not silently block a protected operator even if its SQL grants remain unchanged.
  if exists (
    select 1 from (select distinct role_name from unnest(array['postgres', 'service_role', current_user::text]) as x(role_name)) protected_roles
    left join pg_roles r on r.rolname = protected_roles.role_name
    where r.oid is null or not (r.rolsuper or r.rolbypassrls)
  ) then
    raise exception 'SEC-023: a protected role cannot bypass RLS; rolling back';
  end if;

  for backup in
    select c.oid, n.nspname, c.relname, c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname = any(target_names)
    order by c.relname
  loop
    found_count := found_count + 1;
    -- Stabilize this table's metadata and privilege checks until transaction end.
    execute format('lock table %I.%I in access exclusive mode', backup.nspname, backup.relname);
    if to_regclass(format('%I.%I', backup.nspname, backup.relname))::oid is distinct from backup.oid then
      raise exception 'SEC-023: identity changed or missing for %; rolling back', backup.relname;
    end if;
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.oid = backup.oid and n.nspname = backup.nspname and c.relname = backup.relname
        and c.relkind = 'r' and c.relrowsecurity = false)
      or exists (select 1 from pg_policy where polrelid = backup.oid) then
      raise exception 'SEC-023: existing RLS or policies on % require review; rolling back', backup.relname;
    end if;
    select coalesce(jsonb_agg(jsonb_build_array(roles.role_name,
      has_table_privilege(roles.role_name, backup.oid, 'SELECT'),
      has_table_privilege(roles.role_name, backup.oid, 'INSERT'),
      has_table_privilege(roles.role_name, backup.oid, 'UPDATE'),
      has_table_privilege(roles.role_name, backup.oid, 'DELETE'),
      has_table_privilege(roles.role_name, backup.oid, 'TRUNCATE'),
      has_table_privilege(roles.role_name, backup.oid, 'REFERENCES'),
      has_table_privilege(roles.role_name, backup.oid, 'TRIGGER'),
      has_table_privilege(roles.role_name, backup.oid, 'MAINTAIN'))
      order by roles.role_name), '[]'::jsonb)
      into table_before
      from (select distinct role_name from unnest(array['postgres', 'service_role', current_user::text]) as x(role_name)) roles;
    select coalesce(jsonb_agg(jsonb_build_array(roles.role_name, a.attnum,
      has_column_privilege(roles.role_name, backup.oid, a.attnum, 'SELECT'),
      has_column_privilege(roles.role_name, backup.oid, a.attnum, 'INSERT'),
      has_column_privilege(roles.role_name, backup.oid, a.attnum, 'UPDATE'),
      has_column_privilege(roles.role_name, backup.oid, a.attnum, 'REFERENCES'))
      order by roles.role_name, a.attnum), '[]'::jsonb)
      into column_before
      from (select distinct role_name from unnest(array['postgres', 'service_role', current_user::text]) as x(role_name)) roles
      cross join pg_attribute a
      where a.attrelid = backup.oid and a.attnum > 0 and not a.attisdropped;

    execute format('alter table %I.%I enable row level security', backup.nspname, backup.relname);
    execute format('revoke all privileges on table %I.%I from public, anon, authenticated', backup.nspname, backup.relname);
    select string_agg(quote_ident(attname), ', ' order by attnum) into column_list
      from pg_attribute where attrelid = backup.oid and attnum > 0 and not attisdropped;
    if column_list is not null then
      execute format('revoke all privileges (%s) on table %I.%I from public, anon, authenticated', column_list, backup.nspname, backup.relname);
    end if;
    if (select relrowsecurity from pg_class where oid = backup.oid) is distinct from true then
      raise exception 'SEC-023: RLS remains disabled on %; rolling back', backup.relname;
    end if;
    if exists (select 1 from pg_roles r where r.rolname in ('anon', 'authenticated') and
      (has_table_privilege(r.rolname, backup.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
       or has_any_column_privilege(r.rolname, backup.oid, 'SELECT,INSERT,UPDATE,REFERENCES'))) then
      raise exception 'SEC-023: browser privileges remain on %; rolling back', backup.relname;
    end if;
    select coalesce(jsonb_agg(jsonb_build_array(roles.role_name,
      has_table_privilege(roles.role_name, backup.oid, 'SELECT'),
      has_table_privilege(roles.role_name, backup.oid, 'INSERT'),
      has_table_privilege(roles.role_name, backup.oid, 'UPDATE'),
      has_table_privilege(roles.role_name, backup.oid, 'DELETE'),
      has_table_privilege(roles.role_name, backup.oid, 'TRUNCATE'),
      has_table_privilege(roles.role_name, backup.oid, 'REFERENCES'),
      has_table_privilege(roles.role_name, backup.oid, 'TRIGGER'),
      has_table_privilege(roles.role_name, backup.oid, 'MAINTAIN'))
      order by roles.role_name), '[]'::jsonb)
      into table_after
      from (select distinct role_name from unnest(array['postgres', 'service_role', current_user::text]) as x(role_name)) roles;
    select coalesce(jsonb_agg(jsonb_build_array(roles.role_name, a.attnum,
      has_column_privilege(roles.role_name, backup.oid, a.attnum, 'SELECT'),
      has_column_privilege(roles.role_name, backup.oid, a.attnum, 'INSERT'),
      has_column_privilege(roles.role_name, backup.oid, a.attnum, 'UPDATE'),
      has_column_privilege(roles.role_name, backup.oid, a.attnum, 'REFERENCES'))
      order by roles.role_name, a.attnum), '[]'::jsonb)
      into column_after
      from (select distinct role_name from unnest(array['postgres', 'service_role', current_user::text]) as x(role_name)) roles
      cross join pg_attribute a
      where a.attrelid = backup.oid and a.attnum > 0 and not a.attisdropped;

    if table_after is distinct from table_before or column_after is distinct from column_before then
      raise exception 'SEC-023: protected table or individual column privileges changed on %; rolling back', backup.relname;
    end if;
  end loop;
  if found_count <> cardinality(target_names) then
    raise exception 'SEC-023: repaired % of % expected backups; rolling back', found_count, cardinality(target_names);
  end if;
end
$repair$;
commit;
