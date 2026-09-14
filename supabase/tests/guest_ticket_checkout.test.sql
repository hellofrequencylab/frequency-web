-- pgTAP behavioral guard for guest ticket checkout (migration 20270345003400).
--
-- Three things are pinned here.
--
--   1. THE IDENTITY GUARDS on reserve_ticket_atomic. It now takes EITHER a profile id OR a guest
--      address. Neither is a paid row nobody can be told about; both is a row whose owner is
--      ambiguous the moment claim_guest_tickets runs. Both are refused with a reason, before the
--      advisory lock is taken, and neither writes a row.
--
--   2. THAT THE CAPACITY RULE IS THE SAME RULE, not a copy of it. A guest reservation and a member
--      reservation fill the same tier, and once the tier is full the NEXT one is refused whichever
--      kind of buyer it is. The capped tier here holds two seats and is filled by one of each, so
--      the two sold_out assertions can only pass if the committed-capacity sum counted both.
--
--   3. claim_guest_tickets(), the authenticated door. It takes no arguments, reads the caller's
--      CONFIRMED address out of auth.users server-side, returns 0 for a caller with no profile / no
--      proven address / an unconfirmed one, claims only its own rows, leaves guest_email in place,
--      and is idempotent.
--
-- It also pins the judgement call in that migration: there is deliberately NO unique index on
-- (event_id, lower(guest_email)), because a ticket row is a purchase ATTEMPT and not a seat. Two
-- purchases by the same address on the same event both land, and the claim takes both.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(31);

-- ── Fixture ─────────────────────────────────────────────────────────────────────────────────────
-- Two ticketed events. T1 carries a CAPPED tier (two seats) and exists only to prove the capacity
-- rule; T2 carries an UNCAPPED tier so the claim assertions cannot be disturbed by a sold-out
-- refusal. scope_type 'public' with a scope_id that resolves to nothing is what a standalone public
-- event looks like to sync_event_scope_arc; host_id stays null so the suspension trigger has no
-- actor to check.

insert into public.events (id, title, slug, scope_type, scope_id, visibility, status, starts_at, ends_at, join_mode, is_cancelled)
values
  ('00000000-0000-4000-e800-000000000001', 'GTC capped', 'gtc-capped', 'public',
   '00000000-0000-4000-e800-0000000000aa', 'public', 'published',
   now() + interval '30 days', now() + interval '30 days 2 hours', 'tickets', false),
  ('00000000-0000-4000-e800-000000000002', 'GTC open', 'gtc-open', 'public',
   '00000000-0000-4000-e800-0000000000aa', 'public', 'published',
   now() + interval '30 days', now() + interval '30 days 2 hours', 'tickets', false);

insert into public.event_ticket_types (id, event_id, name, pricing_mode, price_cents, quantity)
values
  ('00000000-0000-4000-e800-0000000000c1', '00000000-0000-4000-e800-000000000001',
   'Capped tier', 'fixed', 2500, 2),
  ('00000000-0000-4000-e800-0000000000c2', '00000000-0000-4000-e800-000000000002',
   'Open tier', 'fixed', 2500, null);

-- profiles.auth_user_id carries a FOREIGN KEY to auth.users, so the auth rows come first.
--   A  CONFIRMED address, and the address the two guest purchases on T2 are made under
--   B  the MEMBER buyer: the both-identities refusal, and the member half of the capacity pair
--   C  UNCONFIRMED address, carrying a guest purchase that must stay unclaimed
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-e800-0000000000a1', 'a-confirmed@test.local',   now()),
  ('00000000-0000-4000-e800-0000000000a2', 'b-member@test.local',      now()),
  ('00000000-0000-4000-e800-0000000000a3', 'c-unconfirmed@test.local', null);

insert into public.profiles (id, display_name, handle, auth_user_id) values
  ('00000000-0000-4000-e800-0000000000b1', 'Buyer A', 'gtc_a', '00000000-0000-4000-e800-0000000000a1'),
  ('00000000-0000-4000-e800-0000000000b2', 'Buyer B', 'gtc_b', '00000000-0000-4000-e800-0000000000a2'),
  ('00000000-0000-4000-e800-0000000000b3', 'Buyer C', 'gtc_c', '00000000-0000-4000-e800-0000000000a3');

-- ── 0. The doors exist and are open to exactly the roles they are for ───────────────────────────

select has_function('public', 'reserve_ticket_atomic',
  '{uuid,uuid,uuid,integer,integer,integer,text,text,text}'::name[],
  'reserve_ticket_atomic now takes a ninth argument, the guest address');
select has_function('public', 'claim_guest_tickets', '{}'::name[],
  'claim_guest_tickets() exists and takes no arguments (it never accepts an email, ADR-854)');
select is(
  has_function_privilege('anon', 'public.claim_guest_tickets()', 'execute'),
  false, 'anon cannot reach claim_guest_tickets (it has no proven address to match on)');
select is(
  has_function_privilege('authenticated', 'public.claim_guest_tickets()', 'execute'),
  true, 'authenticated can reach claim_guest_tickets');
select is(
  has_function_privilege('anon',
    'public.reserve_ticket_atomic(uuid,uuid,uuid,integer,integer,integer,text,text,text)', 'execute'),
  false, 'anon cannot reach reserve_ticket_atomic: the amount and the fee are caller-supplied');

-- ── 1. Exactly one identity, refused before the lock is taken ───────────────────────────────────

select is(
  public.reserve_ticket_atomic(
    '00000000-0000-4000-e800-0000000000c1', '00000000-0000-4000-e800-000000000001',
    null, 1, 2500, 250, 'usd', 'gtc_sess_neither', null) ->> 'reason',
  'no_identity',
  'NEITHER a buyer nor a guest address is refused: that is a paid row nobody can be told about');

select is(
  public.reserve_ticket_atomic(
    '00000000-0000-4000-e800-0000000000c1', '00000000-0000-4000-e800-000000000001',
    '00000000-0000-4000-e800-0000000000b2', 1, 2500, 250, 'usd', 'gtc_sess_both',
    'b-member@test.local') ->> 'reason',
  'ambiguous_identity',
  'BOTH a buyer and a guest address is refused: the claim door could not tell who owns it');

select is(
  public.reserve_ticket_atomic(
    '00000000-0000-4000-e800-0000000000c1', '00000000-0000-4000-e800-000000000001',
    null, 1, 2500, 250, 'usd', 'gtc_sess_malformed', 'not-an-address') ->> 'reason',
  'invalid_email',
  'a malformed guest address is refused with the same regex capture_guest_rsvp uses');

select is(
  (select count(*)::int from public.event_tickets
    where ticket_type_id = '00000000-0000-4000-e800-0000000000c1'),
  0,
  'and none of the three refusals wrote a row');

-- ── 2. A guest reserves, and the row carries the address and no buyer ───────────────────────────
-- The address is given with capitals and surrounding space on purpose: the normalised form is what
-- the claim door matches on later.

select is(
  public.reserve_ticket_atomic(
    '00000000-0000-4000-e800-0000000000c1', '00000000-0000-4000-e800-000000000001',
    null, 1, 2500, 250, 'usd', 'gtc_sess_capguest', '  Cap-Guest@Test.local  ') ->> 'reserved',
  'true',
  'GUEST: a signed-out buyer reserves a seat on the capped tier');

select is(
  (select guest_email || '|' || coalesce(buyer_profile_id::text, 'null')
     from public.event_tickets where stripe_checkout_session_id = 'gtc_sess_capguest'),
  'cap-guest@test.local|null',
  'and the row carries the NORMALISED address with no buyer attached');

-- ── 3. A member reserves the other seat, through the unchanged call shape ───────────────────────

select is(
  public.reserve_ticket_atomic(
    '00000000-0000-4000-e800-0000000000c1', '00000000-0000-4000-e800-000000000001',
    '00000000-0000-4000-e800-0000000000b2', 1, 2500, 250, 'usd', 'gtc_sess_member1', null) ->> 'reserved',
  'true',
  'MEMBER: the existing eight-argument call still reserves (the ninth argument defaults to null)');

select is(
  (select coalesce(guest_email, 'null') || '|' || buyer_profile_id::text
     from public.event_tickets where stripe_checkout_session_id = 'gtc_sess_member1'),
  'null|00000000-0000-4000-e800-0000000000b2',
  'and the member row carries the buyer with no guest address');

-- ── 4. The tier is now full, and it is full for BOTH kinds of buyer ─────────────────────────────
-- Two seats, one taken by a guest and one by a member, both still pending and inside the 30 minute
-- window. Each refusal below can only happen if the committed-capacity sum counted the OTHER kind
-- of buyer's in-flight row.

select is(
  public.reserve_ticket_atomic(
    '00000000-0000-4000-e800-0000000000c1', '00000000-0000-4000-e800-000000000001',
    null, 1, 2500, 250, 'usd', 'gtc_sess_guestlate', 'late-guest@test.local') ->> 'reason',
  'sold_out',
  'a GUEST is refused by the member''s in-flight pending row: the same rule, not a copy of it');

select is(
  public.reserve_ticket_atomic(
    '00000000-0000-4000-e800-0000000000c1', '00000000-0000-4000-e800-000000000001',
    '00000000-0000-4000-e800-0000000000b1', 1, 2500, 250, 'usd', 'gtc_sess_memberlate', null) ->> 'reason',
  'sold_out',
  'and a MEMBER is refused by the GUEST''s in-flight pending row, which is the half that would have regressed');

select is(
  (select count(*)::int from public.event_tickets
    where ticket_type_id = '00000000-0000-4000-e800-0000000000c1'),
  2,
  'the capped tier holds exactly its two seats: neither refusal wrote a row');

-- ── 5. NO unique index on (event_id, lower(guest_email)), on purpose ────────────────────────────
-- A ticket row is a purchase ATTEMPT, not a seat. A buyer may retry a declined card or come back
-- and buy more, and a unique index would refuse both. Two purchases, same address, same event,
-- on the uncapped tier so nothing above can disturb them.
--
-- lives_ok rather than is(): a unique index would RAISE inside the function, and an uncaught
-- exception aborts the whole file instead of failing one assertion. The count below is what says
-- both purchases actually landed.

select lives_ok(
  $q$select public.reserve_ticket_atomic(
       '00000000-0000-4000-e800-0000000000c2', '00000000-0000-4000-e800-000000000002',
       null, 1, 2500, 250, 'usd', 'gtc_sess_guest1', '  A-Confirmed@Test.local  ')$q$,
  'the confirmed buyer''s FIRST guest purchase on the open event');

select lives_ok(
  $q$select public.reserve_ticket_atomic(
       '00000000-0000-4000-e800-0000000000c2', '00000000-0000-4000-e800-000000000002',
       null, 2, 5000, 500, 'usd', 'gtc_sess_guest2', 'a-confirmed@test.local')$q$,
  'and a SECOND purchase by the same address on the SAME event is accepted, not refused by a unique index');

select is(
  (select count(*)::int from public.event_tickets
    where event_id = '00000000-0000-4000-e800-000000000002'
      and lower(guest_email) = 'a-confirmed@test.local'),
  2,
  'both purchases are on the table: uniqueness that is right for a seat is wrong for a receipt');

-- The unconfirmed buyer's purchase, on the same uncapped tier.
select is(
  public.reserve_ticket_atomic(
    '00000000-0000-4000-e800-0000000000c2', '00000000-0000-4000-e800-000000000002',
    null, 1, 2500, 250, 'usd', 'gtc_sess_guestc', 'c-unconfirmed@test.local') ->> 'reserved',
  'true',
  'and the unconfirmed buyer''s guest purchase lands too (the fixture for section 7)');

-- ── 6. No proof, no claim: unauthenticated, then a signed-in stranger with no profile ───────────

set local role authenticated;
select set_config('request.jwt.claims', '', true);
select is(
  public.claim_guest_tickets(), 0,
  'UNAUTHENTICATED (auth.uid() null): returns 0');

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-e800-00000000dead', 'role', 'authenticated')::text, true);
select is(
  public.claim_guest_tickets(), 0,
  'PROFILE-LESS caller: returns 0');
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from public.event_tickets
    where guest_email is not null and buyer_profile_id is not null),
  0,
  'and neither call attached anything');

-- ── 7. An UNCONFIRMED address is a claim and not a proof, and this row has money on it ──────────

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-e800-0000000000a3', 'role', 'authenticated')::text, true);
select is(
  public.claim_guest_tickets(), 0,
  'UNCONFIRMED address: returns 0 even though a guest purchase for that address exists');
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select buyer_profile_id from public.event_tickets
    where stripe_checkout_session_id = 'gtc_sess_guestc'),
  null::uuid,
  'and that purchase is still unclaimed');

-- ── 8. The owner claims their own purchases, and only their own ─────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-e800-0000000000a1', 'role', 'authenticated')::text, true);
select is(
  public.claim_guest_tickets(), 2,
  'OWNER, confirmed address: attaches exactly the two purchases made under it');
reset role;
select set_config('request.jwt.claims', '', true);

-- Asserts the INVARIANT, not a fixture guess: a trigger mints a profile of its own when the
-- auth.users row lands, so caller A owns two, and profiles.auth_user_id has no unique constraint to
-- stop it. What must be true is that a PAID ticket is attached to a profile belonging to the
-- CALLER, which holds whichever row the ordering picks.
select is(
  (select count(*)::int
     from public.event_tickets t
     join public.profiles p on p.id = t.buyer_profile_id
    where t.stripe_checkout_session_id in ('gtc_sess_guest1', 'gtc_sess_guest2')
      and p.auth_user_id = '00000000-0000-4000-e800-0000000000a1'),
  2,
  'both are attached to a profile owned by the caller''s own auth user');

select is(
  (select guest_email from public.event_tickets
    where stripe_checkout_session_id = 'gtc_sess_guest1'),
  'a-confirmed@test.local',
  'and guest_email is LEFT IN PLACE: it is the record of how the ticket was bought');

select is(
  (select buyer_profile_id from public.event_tickets
    where stripe_checkout_session_id = 'gtc_sess_guestc'),
  null::uuid,
  'the other guest''s purchase is untouched: a claim reaches only its own address');

-- ── 9. Idempotent: a second call matches nothing and cannot re-point a purchase ─────────────────

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-e800-0000000000a1', 'role', 'authenticated')::text, true);
select is(
  public.claim_guest_tickets(), 0,
  'IDEMPOTENT: the second call matches no unclaimed row and returns 0');
reset role;
select set_config('request.jwt.claims', '', true);

-- The member's own purchase was never a guest purchase and must not have been swept up by any of
-- the above, whoever was signed in.
select is(
  (select buyer_profile_id from public.event_tickets
    where stripe_checkout_session_id = 'gtc_sess_member1'),
  '00000000-0000-4000-e800-0000000000b2'::uuid,
  'and the member purchase still belongs to the member who made it');

select * from finish();
rollback;
