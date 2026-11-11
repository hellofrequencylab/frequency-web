-- pgTAP guard for the persistent cart (DEF-ETSY P5, migration 20270346039000): service role only.
-- RLS is on with no policy, anon and authenticated hold no privilege, and lines is checked to be an array.

begin;
select plan(5);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.commerce_carts'::regclass),
  'commerce_carts has row level security on'
);

select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'commerce_carts'),
  0,
  'commerce_carts has no client policy'
);

select ok(
  not has_table_privilege('anon', 'public.commerce_carts', 'select')
  and not has_table_privilege('anon', 'public.commerce_carts', 'insert'),
  'anon holds no privilege on commerce_carts'
);

select ok(
  not has_table_privilege('authenticated', 'public.commerce_carts', 'select')
  and not has_table_privilege('authenticated', 'public.commerce_carts', 'insert')
  and not has_table_privilege('authenticated', 'public.commerce_carts', 'update')
  and not has_table_privilege('authenticated', 'public.commerce_carts', 'delete'),
  'authenticated holds no privilege on commerce_carts'
);

select matches(
  (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid = 'public.commerce_carts'::regclass and contype = 'c' limit 1),
  'jsonb_typeof',
  'lines is checked to be a jsonb array'
);

select * from finish();
rollback;
