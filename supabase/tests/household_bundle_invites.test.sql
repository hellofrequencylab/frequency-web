-- pgTAP behavioral guard for the Household / Circle bundle SEAT INVITES (migration
-- 20270226000100_household_bundle_invites.sql, ADR-370). Its sibling,
-- household_bundle_seating.test.sql, pins the webhook seating branch; this file pins the half a
-- member drives: offering a seat, accepting one, and the accounting that keeps the two honest.
--
-- The failure modes here are money failures, and one of them is worse than the rest:
--
--   🔴 AN ACCEPTANCE THAT ADVANCES profiles.household_bundle_event_at. That column is the Stripe
--      event-ordering guard. Push it to now() when somebody accepts an invite and the real
--      customer.subscription.deleted, created seconds earlier, arrives looking stale, is dropped,
--      and a CANCELED bundle stays seated with everyone on a paid tier for free. Test 6 fails if
--      that stamp moves by so much as a microsecond.
--
--   · An oversold bundle. A pending invite that does not count against the seat cap lets an owner
--     send five offers for three seats; two people then accept into nothing.
--   · A double-accept that seats twice, or worse, records household_bundle_prior_tier a second
--     time from the tier the bundle itself just granted (which would make leaving an upgrade).
--   · A renewal that evicts an invited seat because it only knows the checkout roster.
--
-- The TypeScript side (lib/billing/bundle-invites.test.ts) pins the gates and the pure seat math.
-- Only this file can pin the SQL, because only here is the transaction real.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(23);

-- Seed the household. display_name + handle are the only NOT NULL columns without defaults, and
-- profiles.id carries no auth FK, so bare uuids are fine.
insert into public.profiles (id, display_name, handle, membership_tier) values
  ('00000000-0000-0000-0000-0000000000c1', 'Owner',   'inv_owner', 'free'),
  ('00000000-0000-0000-0000-0000000000c2', 'Ada',     'inv_ada',   'free'),
  ('00000000-0000-0000-0000-0000000000c3', 'Ben',     'inv_ben',   'free'),
  ('00000000-0000-0000-0000-0000000000c4', 'Cleo',    'inv_cleo',  'free'),
  ('00000000-0000-0000-0000-0000000000c5', 'Stranger','inv_str',   'free');

-- The bundle goes live: THREE seats, crew, the owner alone on the roster (they bought first and
-- chose their household later, which is the whole case this migration exists for).
do $$ begin
  perform public.apply_bundle_seating_atomic(
    '00000000-0000-0000-0000-0000000000c1', '2026-08-01T12:00:00Z', '{}'::uuid[],
    'crew', 3, true, 'cus_invite');
end $$;

-- 1. The purchased TERMS are recorded on the owner's row, so a seat action taken months later
--    counts against what was bought rather than against today's operator config.
select is(
  (select household_bundle_seats from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  3,
  'the purchased seat count is stamped on the owner profile'
);
select is(
  (select household_bundle_tier from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  'crew',
  'the purchased granted tier is stamped on the owner profile'
);

-- 2. Inviting yourself is refused: the owner already holds a seat and pointing at themselves
--    again would consume a second one.
select is(
  (public.create_bundle_invite_atomic(
    '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c1', 4) ->> 'reason'),
  'self',
  'the owner cannot invite themselves into their own bundle'
);

-- 3. Two invites fit the two open seats (owner + 2 = 3).
select is(
  (public.create_bundle_invite_atomic(
    '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2', 4) ->> 'remaining'),
  '1',
  'the first invite leaves one seat open'
);
select is(
  (public.create_bundle_invite_atomic(
    '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c3', 4) ->> 'remaining'),
  '0',
  'the second invite fills the last seat'
);

-- 4. 🔴 THE OVERSELL GUARD. Nobody has accepted yet, so every seat is still physically empty.
--    A third invite must still be refused, because the two PENDING ones are holding seats.
select is(
  (public.create_bundle_invite_atomic(
    '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c4', 4) ->> 'reason'),
  'no_seats',
  'a pending invite holds a seat: a bundle cannot be oversold before anyone accepts'
);
select is(
  (select count(*)::int from public.household_bundle_invites
    where owner_profile_id = '00000000-0000-0000-0000-0000000000c1' and status = 'pending'),
  2,
  'the refused invite wrote no row'
);

-- 5. A duplicate offer to the same person collides on the one-pending partial index.
select is(
  (public.create_bundle_invite_atomic(
    '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2', 4) ->> 'reason'),
  'already_invited',
  'a second live invite to the same member is refused, not stacked'
);

-- 6. 🔴 THE EVENT STAMP. Capture it, accept an invite, and prove it did not move. If this test
--    ever fails, a canceled bundle can stay seated: read this file's header before "fixing" it.
create temporary table _stamp_before on commit drop as
  select household_bundle_event_at as at
    from public.profiles where id = '00000000-0000-0000-0000-0000000000c1';

-- Only the invitee may accept. A stranger holding the invite id gets nothing.
select is(
  (public.accept_bundle_invite_atomic(
     (select id from public.household_bundle_invites
       where to_profile_id = '00000000-0000-0000-0000-0000000000c2' and status = 'pending'),
     '00000000-0000-0000-0000-0000000000c5', 'crew', 4) ->> 'reason'),
  'not_yours',
  'only the invitee can accept their invite'
);

select is(
  (public.accept_bundle_invite_atomic(
     (select id from public.household_bundle_invites
       where to_profile_id = '00000000-0000-0000-0000-0000000000c2' and status = 'pending'),
     '00000000-0000-0000-0000-0000000000c2', 'crew', 4) ->> 'seated'),
  'true',
  'the invitee accepts and takes the seat'
);
select is(
  (select membership_tier from public.profiles where id = '00000000-0000-0000-0000-0000000000c2'),
  'crew',
  'accepting grants the tier the bundle was bought to give'
);
select is(
  (select household_bundle_prior_tier from public.profiles where id = '00000000-0000-0000-0000-0000000000c2'),
  'free',
  'what the seat held before the bundle is recorded on the way in'
);
select is(
  (select household_bundle_event_at from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  (select at from _stamp_before),
  'ACCEPTING AN INVITE DOES NOT ADVANCE household_bundle_event_at (a moved stamp drops the real cancellation)'
);

-- 7. Accepting twice seats once. The claim is filtered on status = 'pending', so the second
--    click answers nothing and cannot re-record the prior tier from the tier just granted.
select is(
  (public.accept_bundle_invite_atomic(
     (select id from public.household_bundle_invites
       where to_profile_id = '00000000-0000-0000-0000-0000000000c2'),
     '00000000-0000-0000-0000-0000000000c2', 'crew', 4) ->> 'reason'),
  'already_answered',
  'a second acceptance of the same invite is refused'
);
select is(
  (select count(*)::int from public.profiles
    where household_bundle_id = '00000000-0000-0000-0000-0000000000c1'),
  2,
  'accepting twice seats exactly once'
);
select is(
  (select household_bundle_prior_tier from public.profiles where id = '00000000-0000-0000-0000-0000000000c2'),
  'free',
  'the recorded prior tier survives the second acceptance'
);

-- 8. A LATER Stripe event carrying the ORIGINAL checkout roster (which was empty) must not evict
--    the seat somebody accepted. This is the renewal that would otherwise silently unseat them.
do $$ begin
  perform public.apply_bundle_seating_atomic(
    '00000000-0000-0000-0000-0000000000c1', '2026-08-05T12:00:00Z', '{}'::uuid[],
    'crew', 3, true, null);
end $$;
select is(
  (select household_bundle_id from public.profiles where id = '00000000-0000-0000-0000-0000000000c2'),
  '00000000-0000-0000-0000-0000000000c1'::uuid,
  'a renewal event does not evict a member an accepted invite seated'
);

-- 9. Answering an invite frees the seat it held. Ben declines, so Cleo now fits.
update public.household_bundle_invites
   set status = 'declined', responded_at = now()
 where to_profile_id = '00000000-0000-0000-0000-0000000000c3' and status = 'pending';
select is(
  (public.create_bundle_invite_atomic(
    '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c4', 4) ->> 'created'),
  'true',
  'a declined invite releases its seat for someone else'
);

-- 10. An expired invite holds nothing. Age Cleo's invite past its window and check that the next
--     send sweeps it and reuses the seat.
update public.household_bundle_invites
   set expires_at = now() - interval '1 day'
 where to_profile_id = '00000000-0000-0000-0000-0000000000c4' and status = 'pending';
select is(
  (public.create_bundle_invite_atomic(
    '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c3', 4) ->> 'created'),
  'true',
  'an elapsed pending invite is swept and its seat returns to the bundle'
);

-- 11. Cancel empties the bundle, restores the invited seat, and closes every invite so nothing
--     can be accepted against a subscription that no longer exists.
do $$ begin
  perform public.apply_bundle_seating_atomic(
    '00000000-0000-0000-0000-0000000000c1', '2026-08-09T12:00:00Z', '{}'::uuid[],
    'crew', 3, false, null);
end $$;
select is(
  (select membership_tier from public.profiles where id = '00000000-0000-0000-0000-0000000000c2'),
  'free',
  'a canceled bundle returns the invited seat to what it held before'
);
select is(
  (select count(*)::int from public.household_bundle_invites
    where owner_profile_id = '00000000-0000-0000-0000-0000000000c1'
      and status in ('pending', 'accepted')),
  0,
  'a canceled bundle leaves no live invite behind'
);
select is(
  (select household_bundle_seats::int from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'),
  null::int,
  'the purchased terms are cleared when the bundle ends'
);

-- 12. And no new invite can be sent into the dead bundle.
select is(
  (public.create_bundle_invite_atomic(
    '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c5', 4) ->> 'reason'),
  'bundle_inactive',
  'a canceled bundle cannot offer seats'
);

select * from finish();
rollback;
