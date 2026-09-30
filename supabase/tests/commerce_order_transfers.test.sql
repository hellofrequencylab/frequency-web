-- THE TRANSFER LEDGER (20270345009800_commerce_order_transfers.sql · LIVE-622 · ADR-1614).
--
-- The DDL guarantees the transfer code leans on, proven against a real Postgres so a future writer
-- cannot drift from them:
--   ADMITTED: a planned row for a Space seller on a split order; a created row with its transfer id.
--   REFUSED: a second row for the same seller on the same order (the plan is idempotent by key);
--     a created row with no transfer id; a zero-cent transfer; the platform as a destination;
--     more reversed than was sent; deleting an order a transfer points at.
--   WALLED: RLS on, no policy, and neither anon nor authenticated holds a grant on the table.
--
-- One transaction, rolled back: nothing persists. Fixture style follows commerce_orders_funds_flow.test.sql.

begin;
select plan(11);

-- ── Fixture ──────────────────────────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-4000-a622-000000000001', 'tl-buyer@test.local'),
  ('00000000-0000-4000-a622-000000000002', 'tl-seller@test.local');
delete from public.profiles where auth_user_id in
  ('00000000-0000-4000-a622-000000000001', '00000000-0000-4000-a622-000000000002');
insert into public.profiles (id, auth_user_id, display_name, handle, is_active) values
  ('00000000-0000-4000-b622-000000000001', '00000000-0000-4000-a622-000000000001', 'TL Buyer', 'tl-buyer', true),
  ('00000000-0000-4000-b622-000000000002', '00000000-0000-4000-a622-000000000002', 'TL Seller', 'tl-seller', true);

insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');

insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility, plan) values
  ('00000000-0000-4000-c622-000000000001', 'tl-shop', 'TL Shop', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b622-000000000002', 'active', 'network', 'business');

insert into public.commerce_orders
  (id, buyer_profile_id, owner_kind, entity_id, amount_cents, platform_fee_cents, currency, status, funds_flow)
values ('00000000-0000-4000-f622-000000000001', '00000000-0000-4000-b622-000000000001', 'split',
        (select id from public.entities where key = 'labs' limit 1), 9900, 800, 'usd', 'paid', 'separate');

-- ── 1. The wall: RLS on, no policy, no grant to the two API roles ───────────────────────────
select ok(
  (select relrowsecurity from pg_class where oid = 'public.commerce_order_transfers'::regclass),
  'RLS is on for the transfer ledger'
);
select is_empty(
  $$ select policyname from pg_policies where schemaname = 'public' and tablename = 'commerce_order_transfers' $$,
  'the transfer ledger carries no policy: service role only'
);
select ok(
  not has_table_privilege('anon', 'public.commerce_order_transfers', 'select')
  and not has_table_privilege('authenticated', 'public.commerce_order_transfers', 'select')
  and not has_table_privilege('authenticated', 'public.commerce_order_transfers', 'insert'),
  'neither anon nor authenticated holds a grant on the transfer ledger'
);

-- ── 2. A planned row is written the one way the code writes it ──────────────────────────────
insert into public.commerce_order_transfers
  (id, order_id, seller_key, owner_kind, owner_space_id, stripe_account_id, amount_cents, platform_fee_cents, currency)
values ('00000000-0000-4000-e622-000000000001', '00000000-0000-4000-f622-000000000001',
        'space::00000000-0000-4000-c622-000000000001', 'space', '00000000-0000-4000-c622-000000000001',
        'acct_tl_seller', 4750, 250, 'usd');

select is(
  (select status || ':' || attempts from public.commerce_order_transfers where id = '00000000-0000-4000-e622-000000000001'),
  'planned:0',
  'a new transfer row is planned with no attempts'
);

-- ── 3. One row per seller per order ─────────────────────────────────────────────────────────
select throws_ok($$
  insert into public.commerce_order_transfers
    (order_id, seller_key, owner_kind, owner_space_id, stripe_account_id, amount_cents)
  values ('00000000-0000-4000-f622-000000000001', 'space::00000000-0000-4000-c622-000000000001', 'space',
          '00000000-0000-4000-c622-000000000001', 'acct_tl_seller', 4750)
$$, '23505', null, 'a second row for the same seller on the same order is refused');

-- ── 4. A created transfer carries its Stripe id, and only then ──────────────────────────────
select throws_ok($$
  update public.commerce_order_transfers set status = 'created'
   where id = '00000000-0000-4000-e622-000000000001'
$$, '23514', null, 'a row cannot say created without a Stripe transfer id');

select lives_ok($$
  update public.commerce_order_transfers set status = 'created', stripe_transfer_id = 'tr_tl_1'
   where id = '00000000-0000-4000-e622-000000000001'
$$, 'a created row with its transfer id is written');

-- ── 5. The amounts ──────────────────────────────────────────────────────────────────────────
select throws_ok($$
  insert into public.commerce_order_transfers
    (order_id, seller_key, owner_kind, owner_profile_id, stripe_account_id, amount_cents)
  values ('00000000-0000-4000-f622-000000000001', 'profile:00000000-0000-4000-b622-000000000002:', 'profile',
          '00000000-0000-4000-b622-000000000002', 'acct_tl_seller', 0)
$$, '23514', null, 'a zero-cent transfer is refused');

select throws_ok($$
  insert into public.commerce_order_transfers
    (order_id, seller_key, owner_kind, stripe_account_id, amount_cents)
  values ('00000000-0000-4000-f622-000000000001', 'platform::', 'platform', 'acct_platform', 100)
$$, '23514', null, 'the platform is never a transfer destination');

select throws_ok($$
  update public.commerce_order_transfers set reversed_cents = 4751
   where id = '00000000-0000-4000-e622-000000000001'
$$, '23514', null, 'more cannot be reversed than was sent');

-- ── 6. An order a transfer points at cannot be deleted ──────────────────────────────────────
select throws_ok($$
  delete from public.commerce_orders where id = '00000000-0000-4000-f622-000000000001'
$$, '23503', null, 'an order with a transfer row cannot be deleted out from under it');

select * from finish();
rollback;
