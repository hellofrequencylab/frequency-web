-- SELLING A JOURNEY: the four schema rules (ADR-1397).
--
-- These are pure DDL guarantees, and they are the ones money rides on. A product row that names no
-- Journey cannot be fulfilled; two live products on one Journey are two seat counters on one room;
-- and an enrolment that loses its order when the order is deleted is an access grant a refund can
-- never find again.

begin;
select plan(8);

-- ── Fixture ──────────────────────────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-4000-a397-000000000001', 'sell-author@test.local');
delete from public.profiles where auth_user_id = '00000000-0000-4000-a397-000000000001';
insert into public.profiles (id, auth_user_id, display_name, handle, is_active) values
  ('00000000-0000-4000-b397-000000000001', '00000000-0000-4000-a397-000000000001', 'Sell Author', 'sell-author', true);

insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility, plan) values
  ('00000000-0000-4000-c397-000000000001', 'sell-test', 'Sell Test', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b397-000000000001', 'active', 'network', 'business');

insert into public.journey_plans (id, slug, title, visibility, status, author_id, space_id, enroll_cap) values
  ('00000000-0000-4000-d397-000000000001', 'sell-test-journey', 'Sell Test Journey', 'public', 'approved',
   '00000000-0000-4000-b397-000000000001', '00000000-0000-4000-c397-000000000001', 12);

-- ── 1. The kind is accepted ──────────────────────────────────────────────────────────────────
select lives_ok($$
  insert into public.commerce_products
    (id, owner_kind, owner_space_id, entity_id, product_kind, vertical, title, price_cents, status, journey_plan_id)
  values ('00000000-0000-4000-e397-000000000001', 'space', '00000000-0000-4000-c397-000000000001',
          (select id from public.entities where key = 'labs' limit 1),
          'journey', 'maker', 'Sell Test Journey', 44400, 'active', '00000000-0000-4000-d397-000000000001')
$$, 'a journey product can be written');

select is(
  (select product_kind from public.commerce_products where id = '00000000-0000-4000-e397-000000000001'),
  'journey',
  'the sixth product kind survives the CHECK'
);

-- ── 2. The link CHECK binds the two, BOTH ways ───────────────────────────────────────────────
select throws_ok($$
  insert into public.commerce_products
    (owner_kind, owner_space_id, entity_id, product_kind, vertical, title, price_cents, status, journey_plan_id)
  values ('space', '00000000-0000-4000-c397-000000000001',
          (select id from public.entities where key = 'labs' limit 1),
          'journey', 'maker', 'Journey with no plan', 44400, 'active', null)
$$, '23514', null, 'a journey product naming NO Journey is refused');

select throws_ok($$
  insert into public.commerce_products
    (owner_kind, owner_space_id, entity_id, product_kind, vertical, title, price_cents, status, journey_plan_id)
  values ('space', '00000000-0000-4000-c397-000000000001',
          (select id from public.entities where key = 'labs' limit 1),
          'physical', 'shop', 'Mug that claims a Journey', 1200, 'active', '00000000-0000-4000-d397-000000000001')
$$, '23514', null, 'a NON-journey product naming a Journey is refused');

-- ── 3. One live product per Journey (the canonical-record rule) ──────────────────────────────
select throws_ok($$
  insert into public.commerce_products
    (owner_kind, owner_space_id, entity_id, product_kind, vertical, title, price_cents, status, journey_plan_id)
  values ('space', '00000000-0000-4000-c397-000000000001',
          (select id from public.entities where key = 'labs' limit 1),
          'journey', 'maker', 'Second seat counter', 39900, 'active', '00000000-0000-4000-d397-000000000001')
$$, '23505', null, 'a SECOND live product on one Journey is refused (one Journey, one seat pool)');

-- Archiving the first frees the slot, which is how a re-price works: never an in-place edit, so
-- past orders keep resolving the price they were actually charged.
update public.commerce_products set status = 'archived' where id = '00000000-0000-4000-e397-000000000001';

select lives_ok($$
  insert into public.commerce_products
    (id, owner_kind, owner_space_id, entity_id, product_kind, vertical, title, price_cents, status, journey_plan_id)
  values ('00000000-0000-4000-e397-000000000002', 'space', '00000000-0000-4000-c397-000000000001',
          (select id from public.entities where key = 'labs' limit 1),
          'journey', 'maker', 'Re-priced', 39900, 'active', '00000000-0000-4000-d397-000000000001')
$$, 'archiving the old product frees the slot, so a re-price can write a new row');

-- ── 4. The enrolment keeps its provenance, and losing the order does not lose the access ──────
insert into public.commerce_orders
  (id, buyer_profile_id, owner_kind, owner_space_id, entity_id, amount_cents, currency, status)
values ('00000000-0000-4000-f397-000000000001', '00000000-0000-4000-b397-000000000001', 'space',
        '00000000-0000-4000-c397-000000000001',
        (select id from public.entities where key = 'labs' limit 1), 44400, 'usd', 'paid');

insert into public.journey_enrollments (id, profile_id, plan_id, order_id) values
  ('00000000-0000-4000-0397-000000000001', '00000000-0000-4000-b397-000000000001',
   '00000000-0000-4000-d397-000000000001', '00000000-0000-4000-f397-000000000001');

select is(
  (select order_id from public.journey_enrollments where id = '00000000-0000-4000-0397-000000000001'),
  '00000000-0000-4000-f397-000000000001'::uuid,
  'a paid enrolment carries the order that bought it, so a refund can find it'
);

-- ON DELETE SET NULL, deliberately NOT cascade: deleting an order must never silently strip a
-- learner out of a program they are part way through. The access outlives the bookkeeping.
delete from public.commerce_orders where id = '00000000-0000-4000-f397-000000000001';

select is(
  (select count(*)::int from public.journey_enrollments where id = '00000000-0000-4000-0397-000000000001'),
  1,
  'deleting the order leaves the enrolment standing (SET NULL, never CASCADE)'
);

select * from finish();
rollback;
