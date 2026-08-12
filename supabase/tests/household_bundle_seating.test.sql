-- pgTAP behavioral guard for apply_bundle_seating_atomic (migration 20270225000000): the seating
-- half of the Household / Circle bundle (ADR-370). One paid subscription seats several members, so
-- the failure modes here are money failures: a redelivered Stripe event that seats somebody twice or
-- overwrites the tier they had before, an out-of-order event that re-seats a canceled bundle, or an
-- unseat that cancels a membership the person pays for themselves.
--
-- The TypeScript side (lib/billing/bundle-seats.test.ts) pins the routing and the roster. Only this
-- file can pin the SQL, because only here is the transaction real.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(14);

-- Seed the household. display_name + handle are the only NOT NULL columns without defaults, and
-- profiles.id carries no auth FK, so bare uuids are fine.
insert into public.profiles (id, display_name, handle, membership_tier) values
  ('00000000-0000-0000-0000-00000000b001', 'Owner',    'bundle_owner', 'free'),
  ('00000000-0000-0000-0000-00000000b002', 'Seat A',   'bundle_a',     'free'),
  ('00000000-0000-0000-0000-00000000b003', 'Seat B',   'bundle_b',     'free'),
  ('00000000-0000-0000-0000-00000000b004', 'Seat C',   'bundle_c',     'free'),
  ('00000000-0000-0000-0000-00000000b005', 'Outsider', 'bundle_out',   'free');
-- Seat B pays for their own Crew membership. Nothing the bundle does may ever take it away.
update public.profiles
   set membership_tier = 'crew', membership_payment_status = 'active'
 where id = '00000000-0000-0000-0000-00000000b003';

-- 1. Happy path: the owner and the two stamped seats are seated, and nobody else is.
select is(
  (public.apply_bundle_seating_atomic(
    '00000000-0000-0000-0000-00000000b001', '2026-08-01T12:00:00Z',
    array['00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-00000000b003']::uuid[],
    'crew', 4, true, 'cus_bundle') ->> 'seated'),
  '3',
  'the owner and both stamped members are seated'
);
select is(
  (select count(*)::int from public.profiles where household_bundle_id = '00000000-0000-0000-0000-00000000b001'),
  3,
  'exactly three profiles carry the bundle link'
);
select is(
  (select membership_tier from public.profiles where id = '00000000-0000-0000-0000-00000000b002'),
  'crew',
  'a free seat is granted the bundle tier'
);
select is(
  (select membership_tier from public.profiles where id = '00000000-0000-0000-0000-00000000b005'),
  'free',
  'a profile off the roster is untouched'
);
select is(
  (select household_bundle_prior_tier from public.profiles where id = '00000000-0000-0000-0000-00000000b003'),
  'crew',
  'the tier a member already held is recorded before the bundle seats them'
);
select is(
  (select stripe_customer_id from public.profiles where id = '00000000-0000-0000-0000-00000000b001'),
  'cus_bundle',
  'the owner adopts the Stripe customer in the same transaction'
);

-- 2. REPLAY of the same event: dropped by the ordering guard, nothing changes.
select is(
  (public.apply_bundle_seating_atomic(
    '00000000-0000-0000-0000-00000000b001', '2026-08-01T12:00:00Z',
    array['00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-00000000b003']::uuid[],
    'crew', 4, true, null) ->> 'applied'),
  'false',
  'a redelivery of the same event is dropped (strict >)'
);

-- 3. A LATER event on the same roster passes the guard and STILL seats nothing extra. This is the
--    one that matters on a renewal, and the one that would corrupt prior_tier if seating were not
--    set-to-target.
select is(
  (public.apply_bundle_seating_atomic(
    '00000000-0000-0000-0000-00000000b001', '2026-08-02T12:00:00Z',
    array['00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-00000000b003']::uuid[],
    'crew', 4, true, null) ->> 'seated'),
  '0',
  'a later renewal event re-seats nobody'
);
select is(
  (select household_bundle_prior_tier from public.profiles where id = '00000000-0000-0000-0000-00000000b003'),
  'crew',
  'the recorded prior tier survives the replay (it is written only on the way in)'
);

-- 4. Roster change: dropping a member unseats exactly that member.
select is(
  (public.apply_bundle_seating_atomic(
    '00000000-0000-0000-0000-00000000b001', '2026-08-03T12:00:00Z',
    array['00000000-0000-0000-0000-00000000b002']::uuid[],
    'crew', 4, true, null) ->> 'unseated'),
  '1',
  'a member taken off the roster is unseated'
);
select is(
  (select membership_tier from public.profiles where id = '00000000-0000-0000-0000-00000000b003'),
  'crew',
  'the unseated member keeps the membership they pay for themselves'
);

-- 5. Cancel empties the bundle and restores what each seat held.
do $$ begin
  perform public.apply_bundle_seating_atomic(
    '00000000-0000-0000-0000-00000000b001', '2026-08-04T12:00:00Z', '{}'::uuid[], 'crew', 4, false, null);
end $$;
select is(
  (select count(*)::int from public.profiles where household_bundle_id = '00000000-0000-0000-0000-00000000b001'),
  0,
  'a canceled bundle seats nobody'
);
select is(
  (select membership_tier from public.profiles where id = '00000000-0000-0000-0000-00000000b002'),
  'free',
  'a seat granted its tier by the bundle returns to what it held before'
);

-- 6. The out-of-order straggler the guard exists for: an `active` created BEFORE the cancel,
--    delivered after it, must not re-seat the household.
do $$ begin
  perform public.apply_bundle_seating_atomic(
    '00000000-0000-0000-0000-00000000b001', '2026-08-03T18:00:00Z',
    array['00000000-0000-0000-0000-00000000b002']::uuid[], 'crew', 4, true, null);
end $$;
select is(
  (select count(*)::int from public.profiles where household_bundle_id = '00000000-0000-0000-0000-00000000b001'),
  0,
  'a stale active cannot re-seat a canceled bundle'
);

select * from finish();
rollback;
