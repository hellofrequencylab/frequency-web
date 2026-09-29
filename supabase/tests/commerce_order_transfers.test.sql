-- THE TRANSFER EACH SELLER IS OWED (20270345009800_commerce_order_transfers.sql · LIVE-622 · ADR-1636).
--
-- Pure DDL guarantees the reconciler and the refund ride on: a transfer row names a seller and a
-- positive amount, planned and failed are real states, a destination order can exist without a
-- row, and a second planned row for the same seller on the same order is refused.
--
-- One transaction, rolled back: nothing persists. Fixture style follows commerce_orders_funds_flow.test.sql.

begin;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-4000-a622-000000000001', 'tr-buyer@test.local'),
  ('00000000-0000-4000-a622-000000000002', 'tr-seller@test.local');
delete from public.profiles where auth_user_id in
  ('00000000-0000-4000-a622-000000000001', '00000000-0000-4000-a622-000000000002');
insert into public.profiles (id, auth_user_id, display_name, handle, is_active) values
  ('00000000-0000-4000-b622-000000000001', '00000000-0000-4000-a622-000000000001', 'TR Buyer', 'tr-buyer', true),
  ('00000000-0000-4000-b622-000000000002', '00000000-0000-4000-a622-000000000002', 'TR Seller', 'tr-seller', true);

insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');

insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility, plan) values
  ('00000000-0000-4000-c622-000000000001', 'tr-shop-a', 'TR Shop A', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b622-000000000002', 'active', 'network', 'business'),
  ('00000000-0000-4000-c622-000000000002', 'tr-shop-b', 'TR Shop B', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b622-000000000002', 'active', 'network', 'business');

insert into public.commerce_orders
  (id, buyer_profile_id, owner_kind, owner_profile_id, owner_space_id, entity_id,
   amount_cents, platform_fee_cents, currency, status, funds_flow, seller_stripe_account_id)
values
  ('00000000-0000-4000-f622-000000000001', '00000000-0000-4000-b622-000000000001', 'split', null, null,
   (select id from public.entities where key = 'labs' limit 1),
   9900, 800, 'usd', 'paid', 'separate', null),
  ('00000000-0000-4000-f622-000000000002', '00000000-0000-4000-b622-000000000001', 'space',
   null, '00000000-0000-4000-c622-000000000001',
   (select id from public.entities where key = 'labs' limit 1),
   4400, 220, 'usd', 'paid', 'destination', 'acct_dest');

select is(
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'commerce_order_transfers'),
  1::bigint,
  'commerce_order_transfers exists'
);

select is(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'commerce_order_transfers'),
  true,
  'RLS is on, so a member client cannot read a seller''s transfer'
);

select lives_ok($$
  insert into public.commerce_order_transfers
    (order_id, owner_kind, owner_space_id, stripe_account_id, amount_cents, platform_fee_cents, status)
  values ('00000000-0000-4000-f622-000000000001', 'space', '00000000-0000-4000-c622-000000000001',
          'acct_a', 4700, 400, 'planned')
$$, 'a planned row for one seller of a split order is written');

select lives_ok($$
  insert into public.commerce_order_transfers
    (order_id, owner_kind, owner_space_id, stripe_account_id, amount_cents, platform_fee_cents, status)
  values ('00000000-0000-4000-f622-000000000001', 'space', '00000000-0000-4000-c622-000000000002',
          'acct_b', 4400, 400, 'failed')
$$, 'a failed state is a real state, so a transfer that did not land does not look like one that did');

select throws_ok($$
  insert into public.commerce_order_transfers
    (order_id, owner_kind, owner_space_id, stripe_account_id, amount_cents, platform_fee_cents, status)
  values ('00000000-0000-4000-f622-000000000001', 'space', '00000000-0000-4000-c622-000000000001',
          'acct_a', 100, 0, 'planned')
$$, '23505', null, 'a second planned row for the same seller on the same order is refused');

select throws_ok($$
  insert into public.commerce_order_transfers
    (order_id, owner_kind, owner_space_id, stripe_account_id, amount_cents, platform_fee_cents, status)
  values ('00000000-0000-4000-f622-000000000001', 'space', '00000000-0000-4000-c622-000000000001',
          'acct_zero', 0, 0, 'planned')
$$, '23514', null, 'a transfer of zero cents is refused');

select is(
  (select count(*) from public.commerce_order_transfers
    where order_id = '00000000-0000-4000-f622-000000000002'),
  0::bigint,
  'a destination-charge order has no transfer row'
);

select throws_ok($$
  insert into public.commerce_order_transfers
    (order_id, owner_kind, owner_space_id, stripe_account_id, amount_cents, status)
  values ('00000000-0000-4000-f622-000000000001', 'platform', '00000000-0000-4000-c622-000000000001',
          'acct_plat', 100, 'planned')
$$, '23514', null, 'the platform is never a transfer destination');

select * from finish();
rollback;
