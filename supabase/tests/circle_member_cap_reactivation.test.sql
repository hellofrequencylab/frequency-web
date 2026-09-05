-- pgTAP guard for migration 20270345000500 (scan2 L6-13, 2026-09-05): the circle member cap and
-- circles.member_count agree on REACTIVATION. A dormant membership row flipped to 'active' by
-- UPDATE is a join: it must be refused at cap exactly as an INSERT is, and member_count must
-- follow the status transition in both directions.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(12);

-- ── Fixture ──────────────────────────────────────────────────────────────────────────────────
-- Same shape as membership_event_ordering_guard.test.sql: display_name + handle are the only
-- NOT NULL profile columns without defaults.
insert into public.profiles (id, display_name, handle, is_active) values
  ('00000000-0000-4000-b500-000000000001', 'Cap One',   'cap-one',   true),
  ('00000000-0000-4000-b500-000000000002', 'Cap Two',   'cap-two',   true),
  ('00000000-0000-4000-b500-000000000003', 'Cap Three', 'cap-three', true),
  ('00000000-0000-4000-b500-000000000004', 'Cap Four',  'cap-four',  true);

-- An OPEN circle so no access or plan-floor trigger has an opinion; a cap of TWO seats.
insert into public.circles (id, name, slug, type, status, unlisted, access, member_cap) values
  ('00000000-0000-4000-e500-000000000001', 'Cap Room', 'cap-room', 'online', 'active', false, 'open', 2);

-- ── 1. INSERTs still count and still cap (the original guard is intact) ──────────────────────
insert into public.memberships (id, profile_id, circle_id, status) values
  ('00000000-0000-4000-d500-000000000001', '00000000-0000-4000-b500-000000000001',
   '00000000-0000-4000-e500-000000000001', 'active'),
  ('00000000-0000-4000-d500-000000000002', '00000000-0000-4000-b500-000000000002',
   '00000000-0000-4000-e500-000000000001', 'active');

select is(
  (select member_count from public.circles where id = '00000000-0000-4000-e500-000000000001'),
  2,
  'two active inserts count two'
);

select throws_ok(
  $$ insert into public.memberships (profile_id, circle_id, status)
     values ('00000000-0000-4000-b500-000000000004', '00000000-0000-4000-e500-000000000001', 'active') $$,
  'P0001',
  'circle_full',
  'a third ACTIVE insert at cap is refused (the INSERT path is unchanged)'
);

-- ── 2. A dormant row takes no seat and does not count ────────────────────────────────────────
insert into public.memberships (id, profile_id, circle_id, status) values
  ('00000000-0000-4000-d500-000000000003', '00000000-0000-4000-b500-000000000003',
   '00000000-0000-4000-e500-000000000001', 'inactive');

select is(
  (select member_count from public.circles where id = '00000000-0000-4000-e500-000000000001'),
  2,
  'an inactive insert does not count (member_count follows status, not rows)'
);

-- ── 3. THE FINDING: reactivating at cap is refused by the database ───────────────────────────
select throws_ok(
  $$ update public.memberships set status = 'active'
      where id = '00000000-0000-4000-d500-000000000003' $$,
  'P0001',
  'circle_full',
  'UPDATE inactive -> active at cap raises circle_full (the guard now fires on the UPDATE path)'
);

select is(
  (select status::text from public.memberships where id = '00000000-0000-4000-d500-000000000003'),
  'inactive',
  'the refused reactivation left the row dormant'
);

-- A status-neutral update on the dormant row is not a join and must not be refused.
select lives_ok(
  $$ update public.memberships set joined_at = now()
      where id = '00000000-0000-4000-d500-000000000003' $$,
  'an update that does not touch status is never capped'
);

-- ── 4. Leaving frees a seat; member_count follows in both directions ─────────────────────────
update public.memberships set status = 'inactive'
 where id = '00000000-0000-4000-d500-000000000002';

select is(
  (select member_count from public.circles where id = '00000000-0000-4000-e500-000000000001'),
  1,
  'active -> inactive decrements member_count'
);

select lives_ok(
  $$ update public.memberships set status = 'active'
      where id = '00000000-0000-4000-d500-000000000003' $$,
  'reactivation succeeds once a seat is free'
);

select is(
  (select member_count from public.circles where id = '00000000-0000-4000-e500-000000000001'),
  2,
  'inactive -> active increments member_count'
);

-- An already-active row re-stamped active is not a transition.
update public.memberships set status = 'active'
 where id = '00000000-0000-4000-d500-000000000001';

select is(
  (select member_count from public.circles where id = '00000000-0000-4000-e500-000000000001'),
  2,
  'active -> active is a no-op for member_count'
);

-- ── 5. DELETE of an active row decrements; of a dormant row does not ─────────────────────────
delete from public.memberships where id = '00000000-0000-4000-d500-000000000001';

select is(
  (select member_count from public.circles where id = '00000000-0000-4000-e500-000000000001'),
  1,
  'deleting an active row decrements'
);

delete from public.memberships where id = '00000000-0000-4000-d500-000000000002';

select is(
  (select member_count from public.circles where id = '00000000-0000-4000-e500-000000000001'),
  1,
  'deleting a dormant row leaves member_count alone'
);

select * from finish();
rollback;
