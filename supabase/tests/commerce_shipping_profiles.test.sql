-- pgTAP guard for seller shipping profiles (DEF-ETSY P3, migration 20270346150000): service role only.
-- RLS is on with no policy, anon and authenticated hold no privilege, rates is checked to be an array,
-- and a listing's profile link is nullable and let go (set null) when the profile is deleted.

begin;
select plan(7);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.commerce_shipping_profiles'::regclass),
  'commerce_shipping_profiles has row level security on'
);

select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'commerce_shipping_profiles'),
  0,
  'commerce_shipping_profiles has no client policy'
);

select ok(
  not has_table_privilege('anon', 'public.commerce_shipping_profiles', 'select')
  and not has_table_privilege('anon', 'public.commerce_shipping_profiles', 'insert'),
  'anon holds no privilege on commerce_shipping_profiles'
);

select ok(
  not has_table_privilege('authenticated', 'public.commerce_shipping_profiles', 'select')
  and not has_table_privilege('authenticated', 'public.commerce_shipping_profiles', 'insert')
  and not has_table_privilege('authenticated', 'public.commerce_shipping_profiles', 'update')
  and not has_table_privilege('authenticated', 'public.commerce_shipping_profiles', 'delete'),
  'authenticated holds no privilege on commerce_shipping_profiles'
);

select ok(
  exists (
    select 1 from pg_constraint
     where conrelid = 'public.commerce_shipping_profiles'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%jsonb_typeof(rates)%'
  ),
  'rates is checked to be a jsonb array'
);

select col_is_null('public', 'commerce_products', 'shipping_profile_id', 'a listing may have no shipping profile');

select is(
  (select confdeltype::text from pg_constraint
    where conrelid = 'public.commerce_products'::regclass and contype = 'f'
      and confrelid = 'public.commerce_shipping_profiles'::regclass),
  'n',
  'deleting a profile sets the listing link to null'
);

select * from finish();
rollback;
