-- THE ORDER SAYS WHICH FUNDS FLOW IT TOOK (20270345009700_commerce_orders_funds_flow.sql · LIVE-621 · ADR-1576).
--
-- Pure DDL guarantees, and the ones a refund rides on: a destination order names one seller and a
-- separate order names none, and no row can say one thing in owner_kind and the other in
-- funds_flow. The code writes both from one plan; this file proves the database refuses the rows
-- the code must never write, so a future writer cannot drift them apart.
--
--   ADMITTED: a Space order with no funds_flow given lands as 'destination' (every existing writer
--     is unchanged); a split order with 'separate', null owner ids and no seller account is written.
--   REFUSED: a funds_flow outside the two; 'split' with 'destination'; a Space with 'separate';
--     a split order naming a Space; a split order naming a seller account.
--
-- One transaction, rolled back: nothing persists. Fixture style follows journey_product.test.sql.

begin;
select plan(7);

-- ── Fixture ──────────────────────────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-4000-a621-000000000001', 'ff-buyer@test.local'),
  ('00000000-0000-4000-a621-000000000002', 'ff-seller@test.local');
delete from public.profiles where auth_user_id in
  ('00000000-0000-4000-a621-000000000001', '00000000-0000-4000-a621-000000000002');
insert into public.profiles (id, auth_user_id, display_name, handle, is_active) values
  ('00000000-0000-4000-b621-000000000001', '00000000-0000-4000-a621-000000000001', 'FF Buyer', 'ff-buyer', true),
  ('00000000-0000-4000-b621-000000000002', '00000000-0000-4000-a621-000000000002', 'FF Seller', 'ff-seller', true);

insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');

insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility, plan) values
  ('00000000-0000-4000-c621-000000000001', 'ff-shop', 'FF Shop', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b621-000000000002', 'active', 'network', 'business');

-- ── 1. Every existing writer is unchanged: no funds_flow given lands as destination ──────────
insert into public.commerce_orders
  (id, buyer_profile_id, owner_kind, owner_space_id, entity_id, amount_cents, currency, status)
values ('00000000-0000-4000-f621-000000000001', '00000000-0000-4000-b621-000000000001', 'space',
        '00000000-0000-4000-c621-000000000001',
        (select id from public.entities where key = 'labs' limit 1), 4400, 'usd', 'pending');

select is(
  (select funds_flow from public.commerce_orders where id = '00000000-0000-4000-f621-000000000001'),
  'destination',
  'an order written the old way is a destination charge by default'
);

-- ── 2. The column admits exactly two values ─────────────────────────────────────────────────
select throws_ok($$
  insert into public.commerce_orders
    (buyer_profile_id, owner_kind, owner_space_id, entity_id, amount_cents, currency, status, funds_flow)
  values ('00000000-0000-4000-b621-000000000001', 'space', '00000000-0000-4000-c621-000000000001',
          (select id from public.entities where key = 'labs' limit 1), 4400, 'usd', 'pending', 'transfer')
$$, '23514', null, 'a funds_flow outside destination | separate is refused');

-- ── 3. A split order is written the one way the code writes it ──────────────────────────────
select lives_ok($$
  insert into public.commerce_orders
    (id, buyer_profile_id, owner_kind, owner_profile_id, owner_space_id, entity_id,
     amount_cents, platform_fee_cents, currency, status, funds_flow, seller_stripe_account_id)
  values ('00000000-0000-4000-f621-000000000002', '00000000-0000-4000-b621-000000000001', 'split', null, null,
          (select id from public.entities where key = 'labs' limit 1),
          9900, 800, 'usd', 'pending', 'separate', null)
$$, 'a split order with funds_flow separate, no owner ids and no seller account is written');

-- ── 4. split if and only if separate, both directions ───────────────────────────────────────
select throws_ok($$
  insert into public.commerce_orders
    (buyer_profile_id, owner_kind, entity_id, amount_cents, currency, status, funds_flow)
  values ('00000000-0000-4000-b621-000000000001', 'split',
          (select id from public.entities where key = 'labs' limit 1), 9900, 'usd', 'pending', 'destination')
$$, '23514', null, 'a split order claiming a destination charge is refused');

select throws_ok($$
  insert into public.commerce_orders
    (buyer_profile_id, owner_kind, owner_space_id, entity_id, amount_cents, currency, status, funds_flow)
  values ('00000000-0000-4000-b621-000000000001', 'space', '00000000-0000-4000-c621-000000000001',
          (select id from public.entities where key = 'labs' limit 1), 4400, 'usd', 'pending', 'separate')
$$, '23514', null, 'a single-seller order claiming separate charges is refused');

-- ── 5. A split order names no single seller ─────────────────────────────────────────────────
select throws_ok($$
  insert into public.commerce_orders
    (buyer_profile_id, owner_kind, owner_space_id, entity_id, amount_cents, currency, status, funds_flow)
  values ('00000000-0000-4000-b621-000000000001', 'split', '00000000-0000-4000-c621-000000000001',
          (select id from public.entities where key = 'labs' limit 1), 9900, 'usd', 'pending', 'separate')
$$, '23514', null, 'a split order naming a Space as its seller is refused');

select throws_ok($$
  insert into public.commerce_orders
    (buyer_profile_id, owner_kind, entity_id, amount_cents, currency, status, funds_flow, seller_stripe_account_id)
  values ('00000000-0000-4000-b621-000000000001', 'split',
          (select id from public.entities where key = 'labs' limit 1), 9900, 'usd', 'pending', 'separate', 'acct_1')
$$, '23514', null, 'a split order naming one destination account is refused');

select * from finish();
rollback;
