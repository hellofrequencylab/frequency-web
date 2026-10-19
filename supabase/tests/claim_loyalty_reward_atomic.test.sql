-- pgTAP behavioural guard for claim_loyalty_reward (migration 20270346009600, SCAN-841):
-- a filled loyalty card is claimed once, even from two taps in the same sitting.
--
-- WHY THIS FILE EXISTS. The TypeScript side pins the WIRING (the action calls the RPC,
-- never a bare insert). Only this file can pin the SQL: that a second claim of the same
-- cycle is refused, that a later cycle still claims, that another partner's taps do not
-- fill this card, and that anon/authenticated cannot execute it.
--
-- ⚠️ WHAT THIS FILE DOES **NOT** COVER, stated so it cannot read as coverage (ADR-970):
-- THE ADVISORY LOCK. pgTAP runs in ONE session inside ONE transaction, so removing
-- pg_advisory_xact_lock from the migration leaves every assertion below GREEN. The lock
-- is the entire reason this RPC exists (the app-side read-then-insert double-paid), and
-- it can only be proved with concurrent sessions. If you ever weaken the locking here,
-- re-run that, because nothing in this file will stop you.
--
-- now() is transaction-stable, so visit rows are stamped with explicit redeemed_at values
-- that sit before or after the claim the RPC writes.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(14);

insert into public.profiles (id, display_name, handle) values
  ('00000000-0000-4000-a841-000000000001', 'Scan841 A', 'scan841-a'),
  ('00000000-0000-4000-a841-000000000002', 'Scan841 B', 'scan841-b'),
  ('00000000-0000-4000-a841-000000000003', 'Scan841 C', 'scan841-c');

insert into public.partners (id, name, slug, status) values
  ('00000000-0000-4000-a841-0000000000aa', 'Scan841 Cafe', 'scan841-cafe', 'active'),
  ('00000000-0000-4000-a841-0000000000bb', 'Scan841 Other', 'scan841-other', 'active');

insert into public.partner_offers (id, partner_id, title, active, visits_required, valid_until) values
  ('00000000-0000-4000-a841-0000000000c1', '00000000-0000-4000-a841-0000000000aa', 'Fifth coffee', true, 3, null),
  ('00000000-0000-4000-a841-0000000000c2', '00000000-0000-4000-a841-0000000000aa', 'Expired card', true, 3, timestamptz '2020-01-01 00:00:00+00'),
  ('00000000-0000-4000-a841-0000000000c3', '00000000-0000-4000-a841-0000000000aa', 'Ordinary offer', true, null, null),
  ('00000000-0000-4000-a841-0000000000c4', '00000000-0000-4000-a841-0000000000bb', 'Other cafe card', true, 3, null);

-- Three plaque taps at Cafe for member A, stamped BEFORE any claim.
insert into public.partner_redemptions (partner_id, offer_id, profile_id, source, redeemed_at) values
  ('00000000-0000-4000-a841-0000000000aa', null, '00000000-0000-4000-a841-000000000001', 'nfc', timestamptz '2026-01-01 10:00:00+00'),
  ('00000000-0000-4000-a841-0000000000aa', null, '00000000-0000-4000-a841-000000000001', 'nfc', timestamptz '2026-01-02 10:00:00+00'),
  ('00000000-0000-4000-a841-0000000000aa', null, '00000000-0000-4000-a841-000000000001', 'qr',  timestamptz '2026-01-03 10:00:00+00');

-- Member B is one tap short.
insert into public.partner_redemptions (partner_id, offer_id, profile_id, source, redeemed_at) values
  ('00000000-0000-4000-a841-0000000000aa', null, '00000000-0000-4000-a841-000000000002', 'nfc', timestamptz '2026-01-01 10:00:00+00'),
  ('00000000-0000-4000-a841-0000000000aa', null, '00000000-0000-4000-a841-000000000002', 'nfc', timestamptz '2026-01-02 10:00:00+00');

-- Member C filled the OTHER cafe, not this one.
insert into public.partner_redemptions (partner_id, offer_id, profile_id, source, redeemed_at) values
  ('00000000-0000-4000-a841-0000000000bb', null, '00000000-0000-4000-a841-000000000003', 'nfc', timestamptz '2026-01-01 10:00:00+00'),
  ('00000000-0000-4000-a841-0000000000bb', null, '00000000-0000-4000-a841-000000000003', 'nfc', timestamptz '2026-01-02 10:00:00+00'),
  ('00000000-0000-4000-a841-0000000000bb', null, '00000000-0000-4000-a841-000000000003', 'nfc', timestamptz '2026-01-03 10:00:00+00');

-- ── 0. Grants: not an RPC for the browser ────────────────────────────────────────────────────
select is(has_function_privilege('anon', 'public.claim_loyalty_reward(uuid, uuid)', 'execute'), false,
  'anon cannot execute claim_loyalty_reward');
select is(has_function_privilege('authenticated', 'public.claim_loyalty_reward(uuid, uuid)', 'execute'), false,
  'authenticated cannot execute claim_loyalty_reward');

-- ── 1. A filled card claims once ─────────────────────────────────────────────────────────────
select ok(
  public.claim_loyalty_reward(
    '00000000-0000-4000-a841-000000000001',
    '00000000-0000-4000-a841-0000000000c1'
  ) is not null,
  'a member with enough visits claims the card'
);
select is(
  (select count(*)::int from public.partner_redemptions
    where profile_id = '00000000-0000-4000-a841-000000000001'
      and offer_id = '00000000-0000-4000-a841-0000000000c1'
      and source = 'loyalty'),
  1,
  'and it wrote exactly one loyalty row'
);

select throws_ok(
  $$ select public.claim_loyalty_reward(
       '00000000-0000-4000-a841-000000000001',
       '00000000-0000-4000-a841-0000000000c1'
     ) $$,
  'P0001',
  'not_earned',
  'a second claim of the same cycle is refused'
);
select is(
  (select count(*)::int from public.partner_redemptions
    where profile_id = '00000000-0000-4000-a841-000000000001'
      and offer_id = '00000000-0000-4000-a841-0000000000c1'
      and source = 'loyalty'),
  1,
  'and NO extra loyalty row was written'
);

-- ── 2. A later cycle still claims ────────────────────────────────────────────────────────────
insert into public.partner_redemptions (partner_id, offer_id, profile_id, source, redeemed_at) values
  ('00000000-0000-4000-a841-0000000000aa', null, '00000000-0000-4000-a841-000000000001', 'nfc', now() + interval '1 hour'),
  ('00000000-0000-4000-a841-0000000000aa', null, '00000000-0000-4000-a841-000000000001', 'nfc', now() + interval '2 hours'),
  ('00000000-0000-4000-a841-0000000000aa', null, '00000000-0000-4000-a841-000000000001', 'nfc', now() + interval '3 hours');

select ok(
  public.claim_loyalty_reward(
    '00000000-0000-4000-a841-000000000001',
    '00000000-0000-4000-a841-0000000000c1'
  ) is not null,
  'enough visits after the last claim earn the next cycle'
);
select is(
  (select count(*)::int from public.partner_redemptions
    where profile_id = '00000000-0000-4000-a841-000000000001'
      and offer_id = '00000000-0000-4000-a841-0000000000c1'
      and source = 'loyalty'),
  2,
  'the second cycle wrote a second loyalty row'
);

-- ── 3. Short, expired, ordinary, and the wrong partner ───────────────────────────────────────
select throws_ok(
  $$ select public.claim_loyalty_reward(
       '00000000-0000-4000-a841-000000000002',
       '00000000-0000-4000-a841-0000000000c1'
     ) $$,
  'P0001',
  'not_earned',
  'one tap short is refused'
);
select throws_ok(
  $$ select public.claim_loyalty_reward(
       '00000000-0000-4000-a841-000000000001',
       '00000000-0000-4000-a841-0000000000c2'
     ) $$,
  'P0001',
  'not_running',
  'an expired card is refused'
);
select throws_ok(
  $$ select public.claim_loyalty_reward(
       '00000000-0000-4000-a841-000000000001',
       '00000000-0000-4000-a841-0000000000c3'
     ) $$,
  'P0001',
  'not_running',
  'an ordinary offer is not a loyalty card'
);
select throws_ok(
  $$ select public.claim_loyalty_reward(
       '00000000-0000-4000-a841-000000000003',
       '00000000-0000-4000-a841-0000000000c1'
     ) $$,
  'P0001',
  'not_earned',
  'taps at another partner do not fill this card'
);

-- ── 4. A card at an inactive partner is not running ─────────────────────────────────────────
update public.partners
   set status = 'inactive'
 where id = '00000000-0000-4000-a841-0000000000bb';

select throws_ok(
  $$ select public.claim_loyalty_reward(
       '00000000-0000-4000-a841-000000000003',
       '00000000-0000-4000-a841-0000000000c4'
     ) $$,
  'P0001',
  'not_running',
  'an inactive partner''s card is refused'
);

select is(
  (select count(*)::int from public.partner_redemptions
    where source = 'loyalty'
      and profile_id in (
        '00000000-0000-4000-a841-000000000002',
        '00000000-0000-4000-a841-000000000003'
      )),
  0,
  'the refused paths wrote no loyalty row'
);

select * from finish();
rollback;
