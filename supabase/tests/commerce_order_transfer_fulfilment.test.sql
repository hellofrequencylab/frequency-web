-- EACH SELLER'S SHARE CARRIES ITS OWN FULFILMENT (20270345010500 · LIVE-705 · ADR-1652).
--
-- The DDL guarantees the split-order fulfilment writer leans on:
--   ADMITTED: a new share starts at none with no record; a share moves to shipped with its record;
--     two shares of one order stand at different steps.
--   REFUSED: a step that is not on the ladder; a record that is not an object.
--   WALLED: still RLS on, no policy, no grant to anon or authenticated.
--
-- One transaction, rolled back: nothing persists. Fixture style follows commerce_order_transfers.test.sql.

begin;
select plan(8);

-- ── Fixture ──────────────────────────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-4000-a705-000000000001', 'sf-buyer@test.local'),
  ('00000000-0000-4000-a705-000000000002', 'sf-seller@test.local');
delete from public.profiles where auth_user_id in
  ('00000000-0000-4000-a705-000000000001', '00000000-0000-4000-a705-000000000002');
insert into public.profiles (id, auth_user_id, display_name, handle, is_active) values
  ('00000000-0000-4000-b705-000000000001', '00000000-0000-4000-a705-000000000001', 'SF Buyer', 'sf-buyer', true),
  ('00000000-0000-4000-b705-000000000002', '00000000-0000-4000-a705-000000000002', 'SF Seller', 'sf-seller', true);

insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');

insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility, plan) values
  ('00000000-0000-4000-c705-000000000001', 'sf-shop', 'SF Shop', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b705-000000000002', 'active', 'network', 'business');

insert into public.commerce_orders
  (id, buyer_profile_id, owner_kind, entity_id, amount_cents, platform_fee_cents, currency, status, funds_flow)
values ('00000000-0000-4000-f705-000000000001', '00000000-0000-4000-b705-000000000001', 'split',
        (select id from public.entities where key = 'labs' limit 1), 9900, 800, 'usd', 'paid', 'separate');

insert into public.commerce_order_transfers
  (id, order_id, seller_key, owner_kind, owner_space_id, stripe_account_id, amount_cents, platform_fee_cents)
values
  ('00000000-0000-4000-e705-000000000001', '00000000-0000-4000-f705-000000000001',
   'space::00000000-0000-4000-c705-000000000001', 'space', '00000000-0000-4000-c705-000000000001',
   'acct_sf_space', 4750, 250);
insert into public.commerce_order_transfers
  (id, order_id, seller_key, owner_kind, owner_profile_id, stripe_account_id, amount_cents, platform_fee_cents)
values
  ('00000000-0000-4000-e705-000000000002', '00000000-0000-4000-f705-000000000001',
   'profile:00000000-0000-4000-b705-000000000002:', 'profile', '00000000-0000-4000-b705-000000000002',
   'acct_sf_maker', 4350, 550);

-- ── 1. A new share has not been sent ────────────────────────────────────────────────────────
select is(
  (select fulfillment_status || ':' || coalesce(fulfilment::text, 'null')
     from public.commerce_order_transfers where id = '00000000-0000-4000-e705-000000000001'),
  'none:null',
  'a new share starts at none with no fulfilment record'
);

-- ── 2. A share moves on its own, with its record ────────────────────────────────────────────
select lives_ok($$
  update public.commerce_order_transfers
     set fulfillment_status = 'shipped',
         fulfilment = '{"carrier":"USPS","tracking":"9400","status":"shipped"}'::jsonb
   where id = '00000000-0000-4000-e705-000000000001'
$$, 'a share is marked shipped with its carrier and tracking');

select is(
  (select string_agg(fulfillment_status, ',' order by owner_kind)
     from public.commerce_order_transfers where order_id = '00000000-0000-4000-f705-000000000001'),
  'none,shipped',
  'two shares of one order stand at different steps'
);

select is(
  (select fulfillment_status from public.commerce_orders where id = '00000000-0000-4000-f705-000000000001'),
  'none',
  'a share moving does not move the order by itself (the writer rolls it up)'
);

-- ── 3. The ladder and the record's shape ────────────────────────────────────────────────────
select throws_ok($$
  update public.commerce_order_transfers set fulfillment_status = 'lost'
   where id = '00000000-0000-4000-e705-000000000002'
$$, '23514', null, 'a step that is not on the ladder is refused');

select throws_ok($$
  update public.commerce_order_transfers set fulfilment = '"shipped"'::jsonb
   where id = '00000000-0000-4000-e705-000000000002'
$$, '23514', null, 'a fulfilment record that is not an object is refused');

-- ── 4. Still walled ─────────────────────────────────────────────────────────────────────────
select is_empty(
  $$ select policyname from pg_policies where schemaname = 'public' and tablename = 'commerce_order_transfers' $$,
  'the transfer ledger still carries no policy: service role only'
);
select ok(
  not has_column_privilege('authenticated', 'public.commerce_order_transfers', 'fulfillment_status', 'update')
  and not has_column_privilege('anon', 'public.commerce_order_transfers', 'fulfilment', 'select'),
  'neither anon nor authenticated can read or move a share''s fulfilment'
);

select * from finish();
rollback;
