-- pgTAP guard for the persistent cart (DEF-ETSY P5, migration 20270346038000): RLS is on, the four
-- own-row policies exist and key on get_my_profile_id(), and the lines column is capped to an array.

begin;
select plan(5);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.commerce_carts'::regclass),
  'commerce_carts has row level security on'
);

select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'commerce_carts'),
  4,
  'commerce_carts has exactly the four own-row policies'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'commerce_carts'
      and coalesce(qual, '') || coalesce(with_check, '') like '%get_my_profile_id%'),
  4,
  'every policy keys on get_my_profile_id()'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'commerce_carts' and 'anon' = any(roles)),
  0,
  'no policy opens the cart to anon'
);

select matches(
  (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid = 'public.commerce_carts'::regclass and contype = 'c' limit 1),
  'jsonb_typeof',
  'lines is checked to be a jsonb array'
);

select * from finish();
rollback;
