-- pgTAP guard for app_instances (PROG-E0 tasks 16+17, migration 20270346140000): service role only.
-- RLS is on with no policy, anon and authenticated hold no privilege, the key is per surface (node ids
-- repeat across Spaces), and the id and surface checks hold.

begin;
select plan(7);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.app_instances'::regclass),
  'app_instances has row level security on'
);

select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'app_instances'),
  0,
  'app_instances has no client policy'
);

select ok(
  not has_table_privilege('anon', 'public.app_instances', 'select')
  and not has_table_privilege('anon', 'public.app_instances', 'insert'),
  'anon holds no privilege on app_instances'
);

select ok(
  not has_table_privilege('authenticated', 'public.app_instances', 'select')
  and not has_table_privilege('authenticated', 'public.app_instances', 'insert')
  and not has_table_privilege('authenticated', 'public.app_instances', 'update')
  and not has_table_privilege('authenticated', 'public.app_instances', 'delete'),
  'authenticated holds no privilege on app_instances'
);

select col_is_pk('public', 'app_instances', array['space_id', 'surface_type', 'surface_ref', 'id'],
  'the key is the surface plus the node id');

select matches(
  (select string_agg(pg_get_constraintdef(oid), ' ') from pg_constraint
    where conrelid = 'public.app_instances'::regclass and contype = 'c'),
  'space-profile',
  'surface_type is checked against the architecture surfaces'
);

select matches(
  (select string_agg(pg_get_constraintdef(oid), ' ') from pg_constraint
    where conrelid = 'public.app_instances'::regclass and contype = 'c'),
  'n\[0-9a-z\]',
  'id is checked to be a node id'
);

select * from finish();
rollback;
