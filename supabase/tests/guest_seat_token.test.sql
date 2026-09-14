-- pgTAP behavioral guard for the guest seat token doors of 20270345004200 (PROG-GD2).
--
-- A one-seat token in the receipt lets a signed-out guest read, change or release the seat they
-- hold. The three token doors are granted to `anon` and reachable over PostgREST directly, so every
-- call below is made AS anon; the mint is service_role only and is called as the migration's
-- owner. What this pins, and why each line is its own way for the door to open too wide or close:
--   · CONTROL: a minted token reads the seat as jsonb (status, plus-ones, the host's questions),
--     and a wrong token reads null;
--   · read_guest_seat is STABLE in the catalog, so the GET door cannot write (Postgres enforces it);
--   · the read carries NO location, venue, street or host key: a hidden venue has nothing to leak;
--   · plus-ones obey the member rule: clamped to 5, and a waitlist hold cannot bring anyone;
--   · answers round-trip, keyed on the seat (rsvp_id set, profile_id null), one per question;
--   · release writes the member release's row (not_going, plus_ones 0), clears the token in the
--     same statement, frees capacity (the trigger count), and the token then reads null;
--   · the token expires with the event and dies with a draft;
--   · anon cannot mint, and mint refuses a row that is not a guest seat.
-- The waitlist PROMOTION is TypeScript (promoteFromWaitlist, the member's mechanism) and is pinned
-- by app/(main)/events/[slug]/seat/[token]/seat-actions.test.ts, not here.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(28);

-- ── Seed ────────────────────────────────────────────────────────────────────────────────────────
-- One published, public, future, uncancelled RSVP-mode event with ONE seat, so the second guest
-- lands on the waitlist. host_id stays null so the suspension trigger has no actor.
insert into public.events (id, title, slug, scope_type, scope_id, visibility, status, starts_at, ends_at, join_mode, is_cancelled, capacity, time_zone)
values
  ('00000000-0000-4000-e9a0-000000000001', 'GD2 sit', 'gd2-sit', 'public',
   '00000000-0000-4000-e9a0-0000000000aa', 'public', 'published',
   now() + interval '30 days', now() + interval '30 days 2 hours', 'rsvp', false, 1, 'America/Los_Angeles');

insert into public.event_questions (id, event_id, prompt, type, options, required, position)
values ('00000000-0000-4000-e9a0-0000000000c1', '00000000-0000-4000-e9a0-000000000001', 'Dietary needs?', 'short_text', '[]', false, 0);

-- Two guests through the phase 1 door, as anon. A holds the one seat; B is waitlisted.
set local role anon;
select public.capture_guest_rsvp('00000000-0000-4000-e9a0-000000000001', 'a@example.com', 'Guest A');
select public.capture_guest_rsvp('00000000-0000-4000-e9a0-000000000001', 'b@example.com', 'Guest B');
reset role;

select is(
  (select status from public.event_rsvps where event_id = '00000000-0000-4000-e9a0-000000000001' and guest_email = 'a@example.com'),
  'going', 'seed: guest A holds the one seat'
);
select is(
  (select status from public.event_rsvps where event_id = '00000000-0000-4000-e9a0-000000000001' and guest_email = 'b@example.com'),
  'waitlist', 'seed: guest B is waitlisted by the capacity trigger'
);

-- ── 1. Mint: service_role only, guest rows only ─────────────────────────────────────────────────
create temp table gd2 (who text primary key, rsvp_id uuid, tok uuid);
insert into gd2 (who, rsvp_id)
select 'a', id from public.event_rsvps where event_id = '00000000-0000-4000-e9a0-000000000001' and guest_email = 'a@example.com';
insert into gd2 (who, rsvp_id)
select 'b', id from public.event_rsvps where event_id = '00000000-0000-4000-e9a0-000000000001' and guest_email = 'b@example.com';
-- The doors below are called AS anon and read their token out of this table, so anon needs to
-- see it (a temp table is owned by the test role; without this grant the first anon read raised
-- "permission denied for table gd2" and the plan stopped at 7 of 28).
grant select on gd2 to anon;

set local role anon;
select throws_ok(
  $$ select public.mint_guest_seat_token('00000000-0000-4000-e9a0-000000000001') $$,
  '42501', null,
  'MINT IS NOT FOR ANON: permission denied'
);
reset role;

update gd2 set tok = public.mint_guest_seat_token(rsvp_id) where who = 'a';
select isnt((select tok from gd2 where who = 'a'), null, 'CONTROL: the mint returns a token for a guest seat');
select is(
  (select seat_token_hash from public.event_rsvps where id = (select rsvp_id from gd2 where who = 'a')),
  encode(extensions.digest((select tok from gd2 where who = 'a')::text, 'sha256'), 'hex'),
  'the row stores sha256(token), never the token'
);
select is(public.mint_guest_seat_token('00000000-0000-4000-e9a0-0000000000ff'), null,
  'mint refuses a row that is not a guest seat');

-- ── 2. Read: the GET door, a read and nothing else ──────────────────────────────────────────────
select is(
  (select provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'read_guest_seat'),
  's', 'read_guest_seat is STABLE: Postgres refuses a write inside it'
);

set local role anon;
select is(
  (select (public.read_guest_seat((select tok from gd2 where who = 'a')))->>'status'),
  'going', 'CONTROL: anon reads the seat as going with the minted token'
);
select is(
  (select (public.read_guest_seat((select tok from gd2 where who = 'a')))->>'slug'),
  'gd2-sit', 'the read names the event by slug'
);
select is(
  (select jsonb_array_length((public.read_guest_seat((select tok from gd2 where who = 'a')))->'questions')),
  1, 'the read carries the host''s questions'
);
select is(
  public.read_guest_seat('00000000-0000-4000-e9a0-00000000dead'), null,
  'a wrong token reads null'
);
select is(
  (select bool_or(k in ('location', 'venue_name', 'street', 'city', 'region', 'host', 'host_id', 'guest_email'))
     from jsonb_object_keys(public.read_guest_seat((select tok from gd2 where who = 'a'))) k),
  false, 'A HIDDEN VENUE STAYS HIDDEN: the read carries no location, venue, street, host or address key'
);
reset role;

-- ── 3. Update: plus-ones under the member rule, answers keyed on the seat ───────────────────────
set local role anon;
select is(public.update_guest_seat((select tok from gd2 where who = 'a'), 3, null), true,
  'CONTROL: the token holder sets plus-ones');
reset role;
select is((select plus_ones from public.event_rsvps where id = (select rsvp_id from gd2 where who = 'a')), 3,
  'plus-ones landed at 3');

set local role anon;
select public.update_guest_seat((select tok from gd2 where who = 'a'), 99, null);
reset role;
select is((select plus_ones from public.event_rsvps where id = (select rsvp_id from gd2 where who = 'a')), 5,
  'plus-ones clamp to 5, the member rule');

set local role anon;
select public.update_guest_seat((select tok from gd2 where who = 'a'), null,
  jsonb_build_object('00000000-0000-4000-e9a0-0000000000c1', 'vegetarian', 'not-a-uuid', 'x', '00000000-0000-4000-e9a0-0000000000c9', 'foreign'));
reset role;
select is(
  (select answer from public.event_question_answers
    where question_id = '00000000-0000-4000-e9a0-0000000000c1' and rsvp_id = (select rsvp_id from gd2 where who = 'a')),
  'vegetarian', 'ANSWERS ROUND-TRIP: the answer is stored on the seat'
);
select is(
  (select profile_id from public.event_question_answers
    where question_id = '00000000-0000-4000-e9a0-0000000000c1' and rsvp_id = (select rsvp_id from gd2 where who = 'a')),
  null, 'a guest answer has no profile: keyed on rsvp_id alone'
);
select is(
  (select count(*)::int from public.event_question_answers where rsvp_id = (select rsvp_id from gd2 where who = 'a')),
  1, 'a non-uuid key and a question of another event are skipped'
);
set local role anon;
select public.update_guest_seat((select tok from gd2 where who = 'a'), null,
  jsonb_build_object('00000000-0000-4000-e9a0-0000000000c1', 'vegan'));
select is(
  (select ((public.read_guest_seat((select tok from gd2 where who = 'a')))->'questions'->0)->>'answer'),
  'vegan', 'a second save replaces the answer and the read shows it'
);
reset role;

-- A waitlist hold brings nobody: the member rule (setRsvpPlusOnes guards on status going).
update gd2 set tok = public.mint_guest_seat_token(rsvp_id) where who = 'b';
set local role anon;
select public.update_guest_seat((select tok from gd2 where who = 'b'), 2, null);
reset role;
select is((select plus_ones from public.event_rsvps where id = (select rsvp_id from gd2 where who = 'b')), 0,
  'a waitlisted seat cannot bring plus-ones');

-- ── 4. Release: the member release''s row, the token cleared, the seat freed ─────────────────────
set local role anon;
select is(
  public.release_guest_seat((select tok from gd2 where who = 'a')),
  '00000000-0000-4000-e9a0-000000000001'::uuid,
  'CONTROL: release returns the event id for the caller''s waitlist promotion'
);
reset role;
select is(
  (select status || '/' || plus_ones::text from public.event_rsvps where id = (select rsvp_id from gd2 where who = 'a')),
  'not_going/0', 'the row is what a member''s "Can''t go" writes: not_going, plus_ones 0'
);
select is(
  (select seat_token_hash from public.event_rsvps where id = (select rsvp_id from gd2 where who = 'a')),
  null, 'the token is cleared in the same statement'
);
select is(
  (select count(*)::int from public.event_rsvps
    where event_id = '00000000-0000-4000-e9a0-000000000001' and status = 'going'),
  0, 'CAPACITY IS FREED: no going row holds the one seat now'
);
set local role anon;
select is(public.read_guest_seat((select tok from gd2 where who = 'a')), null,
  'a released seat''s token reads null');
select is(public.release_guest_seat((select tok from gd2 where who = 'a')), null,
  'a second release changes nothing and returns null');
reset role;

-- ── 5. The token expires with the event, and dies with a draft ──────────────────────────────────
-- starts_at and ends_at hold the host's WALL CLOCK kept as UTC parts (lib/time/zone.ts), and the
-- resolver re-reads them through the event's zone; a true instant written here would land seven
-- hours in the future on a Los Angeles event and still read as live. Write the wall clock.
update public.events
   set starts_at = ((now() - interval '3 hours') at time zone 'America/Los_Angeles') at time zone 'UTC',
       ends_at   = ((now() - interval '1 hour')  at time zone 'America/Los_Angeles') at time zone 'UTC'
 where id = '00000000-0000-4000-e9a0-000000000001';
set local role anon;
select is(public.read_guest_seat((select tok from gd2 where who = 'b')), null,
  'EXPIRES WITH THE EVENT: a finished event reads null');
reset role;
update public.events set starts_at = now() + interval '30 days', ends_at = now() + interval '30 days 2 hours', status = 'draft'
 where id = '00000000-0000-4000-e9a0-000000000001';
set local role anon;
select is(public.read_guest_seat((select tok from gd2 where who = 'b')), null,
  'a draft event reads null');
reset role;

select * from finish();
rollback;
