-- SEC-007 PROPOSAL ONLY. Requires separate explicit production authorization.
-- Frequency Community azsqfeonabsbmemvddqd; observed public.spatial_ref_sys OID19953.
-- Permission-only: retain SELECT, service access, extension ownership, RLS state and all data.
-- Not a registered migration; do not apply automatically or repeat the backup repair.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '10s';
do $repair$
declare
  target record;
  columns text;
  role_name text;
  permission text;
  service_before jsonb := '{}'::jsonb;
begin
  select c.oid, c.relfilenode, c.relowner, c.relrowsecurity into strict target
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='spatial_ref_sys' and c.relkind='r';
  if pg_get_userbyid(target.relowner) <> 'supabase_admin' then
    raise exception 'SEC-007: unexpected table owner; rolling back';
  end if;
  if (select array_agg(attname::text order by attnum) from pg_attribute
      where attrelid=target.oid and attnum>0 and not attisdropped)
      is distinct from array['srid','auth_name','auth_srid','srtext','proj4text'] then
    raise exception 'SEC-007: unexpected table shape; rolling back';
  end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
    if not has_table_privilege(role_name,target.oid,'SELECT') then
      raise exception 'SEC-007: expected read access missing for %; rolling back',role_name;
    end if;
  end loop;
  foreach permission in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    service_before := service_before || jsonb_build_object(permission,has_table_privilege('service_role',target.oid,permission));
  end loop;
  revoke insert,update,delete,truncate,references,trigger on table public.spatial_ref_sys from public,anon,authenticated;
  select string_agg(quote_ident(attname),', ' order by attnum) into columns from pg_attribute
    where attrelid=target.oid and attnum>0 and not attisdropped;
  execute format('revoke insert (%s), update (%s), references (%s) on table public.spatial_ref_sys from public, anon, authenticated',columns,columns,columns);
  foreach role_name in array array['anon','authenticated'] loop
    if has_table_privilege(role_name,target.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_any_column_privilege(role_name,target.oid,'INSERT,UPDATE,REFERENCES') then
      raise exception 'SEC-007: browser write privileges remain for %; rolling back',role_name;
    end if;
    if not has_table_privilege(role_name,target.oid,'SELECT') then
      raise exception 'SEC-007: read access changed; rolling back';
    end if;
  end loop;
  foreach permission in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
    if has_table_privilege('service_role',target.oid,permission) is distinct from (service_before->>permission)::boolean then
      raise exception 'SEC-007: service privilege % changed; rolling back',permission;
    end if;
  end loop;
  if not exists(select 1 from pg_class where oid=target.oid and relfilenode=target.relfilenode
    and relowner=target.relowner and relrowsecurity=target.relrowsecurity) then
    raise exception 'SEC-007: physical identity, owner or RLS changed; rolling back';
  end if;
end
$repair$;
commit;
