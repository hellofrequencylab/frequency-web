-- A SPLIT REFUND'S LEDGER COLUMNS (20270345009850_commerce_order_transfer_reversals.sql · LIVE-623 · ADR-1615).
--
-- The DDL guarantees lib/commerce/split-refund.ts leans on, proven against a real Postgres:
--   ADMITTED: a cancelled row with no transfer id (a transfer never made); a reversal target up to
--     the transfer itself.
--   REFUSED: a cancelled row that claims a transfer id; a target above what was sent; a status the
--     code never writes.
--   GENERATED: reversal_owed_cents is the target minus what is reversed, never below zero, and it
--     follows both columns, which is the reconciler's queue.
--   SCAN-649 (20270346000700): a new row holds no lease, no refusals and a zero floor;
--     reversal_attempts_since_target follows attempts and the floor; the floor cannot pass attempts.
--
-- One transaction, rolled back: nothing persists. Fixture style follows commerce_order_transfers.test.sql.

begin;
select plan(11);

-- ── Fixture ──────────────────────────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-4000-a623-000000000001', 'sr-buyer@test.local'),
  ('00000000-0000-4000-a623-000000000002', 'sr-seller@test.local');
delete from public.profiles where auth_user_id in
  ('00000000-0000-4000-a623-000000000001', '00000000-0000-4000-a623-000000000002');
insert into public.profiles (id, auth_user_id, display_name, handle, is_active) values
  ('00000000-0000-4000-b623-000000000001', '00000000-0000-4000-a623-000000000001', 'SR Buyer', 'sr-buyer', true),
  ('00000000-0000-4000-b623-000000000002', '00000000-0000-4000-a623-000000000002', 'SR Seller', 'sr-seller', true);

insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');

insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility, plan) values
  ('00000000-0000-4000-c623-000000000001', 'sr-shop', 'SR Shop', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b623-000000000002', 'active', 'network', 'business');

insert into public.commerce_orders
  (id, buyer_profile_id, owner_kind, entity_id, amount_cents, platform_fee_cents, currency, status, funds_flow)
values ('00000000-0000-4000-f623-000000000001', '00000000-0000-4000-b623-000000000001', 'split',
        (select id from public.entities where key = 'labs' limit 1), 3000, 150, 'usd', 'paid', 'separate');

insert into public.commerce_order_transfers
  (id, order_id, seller_key, owner_kind, owner_space_id, stripe_account_id, amount_cents, platform_fee_cents,
   currency, status, stripe_transfer_id)
values
  ('00000000-0000-4000-e623-000000000001', '00000000-0000-4000-f623-000000000001',
   'space::00000000-0000-4000-c623-000000000001', 'space', '00000000-0000-4000-c623-000000000001',
   'acct_sr_seller', 950, 50, 'usd', 'created', 'tr_sr_1'),
  ('00000000-0000-4000-e623-000000000002', '00000000-0000-4000-f623-000000000001',
   'profile:00000000-0000-4000-b623-000000000002:', 'profile', null,
   'acct_sr_seller', 1900, 100, 'usd', 'planned', null);

-- ── 1. A new row owes nothing back ─────────────────────────────────────────────────────────
select is(
  (select refund_reversal_cents || ':' || reversal_attempts || ':' || reversal_owed_cents
     from public.commerce_order_transfers where id = '00000000-0000-4000-e623-000000000001'),
  '0:0:0',
  'a transfer row starts with no refund target, no reversal attempts and nothing owed'
);

-- ── 2. The target, and what the reconciler reads from it ───────────────────────────────────
update public.commerce_order_transfers set refund_reversal_cents = 316
 where id = '00000000-0000-4000-e623-000000000001';
select is(
  (select reversal_owed_cents from public.commerce_order_transfers where id = '00000000-0000-4000-e623-000000000001'),
  316,
  'a refund target with nothing reversed yet is owed in full'
);

update public.commerce_order_transfers set reversed_cents = 316
 where id = '00000000-0000-4000-e623-000000000001';
select is(
  (select reversal_owed_cents from public.commerce_order_transfers where id = '00000000-0000-4000-e623-000000000001'),
  0,
  'once Stripe has reversed the target, nothing is owed'
);

update public.commerce_order_transfers set reversed_cents = 500
 where id = '00000000-0000-4000-e623-000000000001';
select is(
  (select reversal_owed_cents from public.commerce_order_transfers where id = '00000000-0000-4000-e623-000000000001'),
  0,
  'a reversal beyond the target (made by hand) owes nothing, never a negative'
);

select throws_ok($$
  update public.commerce_order_transfers set refund_reversal_cents = 951
   where id = '00000000-0000-4000-e623-000000000001'
$$, '23514', null, 'a refund can never ask more back than the transfer sent');

-- ── 3. Cancelled: never paid, so never an id ───────────────────────────────────────────────
select lives_ok($$
  update public.commerce_order_transfers set status = 'cancelled', refund_reversal_cents = 1900
   where id = '00000000-0000-4000-e623-000000000002'
$$, 'a planned row on an order refunded in full is cancelled, carrying its whole amount as the target');

select throws_ok($$
  update public.commerce_order_transfers set stripe_transfer_id = 'tr_sr_2'
   where id = '00000000-0000-4000-e623-000000000002'
$$, '23514', null, 'a cancelled row cannot claim a Stripe transfer id');

select throws_ok($$
  update public.commerce_order_transfers set status = 'refunded'
   where id = '00000000-0000-4000-e623-000000000002'
$$, '23514', null, 'a status the code never writes is refused');

-- ── 4. The lease, the refusals and the budget floor (SCAN-649) ──────────────────────────────
select is(
  (select reversal_refusals || ':' || reversal_attempt_floor || ':' || reversal_attempts_since_target
        || ':' || (reversal_lease_until <= now())::text
     from public.commerce_order_transfers where id = '00000000-0000-4000-e623-000000000001'),
  '0:0:0:true',
  'a row starts with no refusals, a zero floor, no attempts since the target and a free lease'
);

update public.commerce_order_transfers set reversal_attempts = 5, reversal_attempt_floor = 3
 where id = '00000000-0000-4000-e623-000000000001';
select is(
  (select reversal_attempts_since_target from public.commerce_order_transfers where id = '00000000-0000-4000-e623-000000000001'),
  2,
  'attempts since the target are counted from the floor, so a raised target gets fresh budget without the counter going back'
);

select throws_ok($$
  update public.commerce_order_transfers set reversal_attempt_floor = 9
   where id = '00000000-0000-4000-e623-000000000001'
$$, '23514', null, 'the floor can never pass the attempts counter');

select * from finish();
rollback;
