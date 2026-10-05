-- A Spotlight owner can hide and unhide a guestbook note, and change NOTHING else (SCAN-758,
-- migration 20270345011700).
--
-- spotlight_guestbook_update is a ROW policy (owner or staff). It cannot limit columns, and until
-- 20270345011700 `authenticated` held Supabase's default table-wide UPDATE, so a page owner could
-- PATCH message and signer_profile_id and publish a note under another member's name. The fix is
-- a column grant: UPDATE on hidden_at only. This file proves both halves on a real database:
--
--   1. the privilege state (has_table_privilege / has_column_privilege), and
--   2. the behaviour under an owner seat: hidden_at flips, every other column is refused with
--      42501 (insufficient_privilege), which Postgres raises before RLS and before any trigger.
--
-- Plus the controls that the narrowing did not take too much: the signer still cannot update
-- (RLS, zero rows), and the hide seam the app uses (update hidden_at ... where id = ... returning
-- id) still runs.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(13);

-- ── Fixture (seeded as postgres, which RLS does not bind) ────────────────────────────────────────

insert into auth.users (id, email) values
  ('00000000-0000-4000-a758-000000000001', 'gb-owner@test.local'),
  ('00000000-0000-4000-a758-000000000002', 'gb-signer@test.local'),
  ('00000000-0000-4000-a758-000000000003', 'gb-bystander@test.local');

insert into public.profiles (id, auth_user_id, display_name, handle) values
  ('00000000-0000-4000-b758-000000000001', '00000000-0000-4000-a758-000000000001', 'Guestbook Owner',     'gb-owner'),
  ('00000000-0000-4000-b758-000000000002', '00000000-0000-4000-a758-000000000002', 'Guestbook Signer',    'gb-signer'),
  ('00000000-0000-4000-b758-000000000003', '00000000-0000-4000-a758-000000000003', 'Guestbook Bystander', 'gb-bystander');

-- trg_on_auth_user_created auto-provisions a profile per auth.users row, so each seeded user has
-- TWO profiles and get_my_profile_id()'s scalar subquery would error. Keep only the fixed ids.
delete from public.profiles
where auth_user_id in (
    '00000000-0000-4000-a758-000000000001', '00000000-0000-4000-a758-000000000002',
    '00000000-0000-4000-a758-000000000003')
  and id not in (
    '00000000-0000-4000-b758-000000000001', '00000000-0000-4000-b758-000000000002',
    '00000000-0000-4000-b758-000000000003');

insert into public.spotlight_guestbook (id, owner_profile_id, signer_profile_id, message) values
  ('00000000-0000-4000-c758-000000000001',
   '00000000-0000-4000-b758-000000000001', '00000000-0000-4000-b758-000000000002', 'what the signer wrote');

-- ── 1. The privilege state ──────────────────────────────────────────────────────────────────────
select ok(
  not has_table_privilege('authenticated', 'public.spotlight_guestbook', 'UPDATE'),
  'authenticated holds no table-wide UPDATE on spotlight_guestbook');
select ok(
  not has_table_privilege('anon', 'public.spotlight_guestbook', 'UPDATE'),
  'anon holds no UPDATE on spotlight_guestbook');
select ok(
  has_column_privilege('authenticated', 'public.spotlight_guestbook', 'hidden_at', 'UPDATE'),
  'authenticated may UPDATE hidden_at (the hide/unhide seam)');
select ok(
  not has_column_privilege('authenticated', 'public.spotlight_guestbook', 'message', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.spotlight_guestbook', 'signer_profile_id', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.spotlight_guestbook', 'owner_profile_id', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.spotlight_guestbook', 'created_at', 'UPDATE'),
  'authenticated may UPDATE none of message, signer_profile_id, owner_profile_id, created_at');
select ok(
  has_table_privilege('authenticated', 'public.spotlight_guestbook', 'SELECT')
  and has_table_privilege('authenticated', 'public.spotlight_guestbook', 'INSERT')
  and has_table_privilege('authenticated', 'public.spotlight_guestbook', 'DELETE'),
  'control: SELECT, INSERT and DELETE grants are untouched');

-- ── 2. The owner seat ───────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a758-000000000001', 'role', 'authenticated')::text, true);

-- The exact shape of hideGuestbookEntry: update hidden_at, filter by id, return id.
select results_eq(
  $$ update public.spotlight_guestbook set hidden_at = now()
      where id = '00000000-0000-4000-c758-000000000001' returning id $$,
  $$ values ('00000000-0000-4000-c758-000000000001'::uuid) $$,
  'the owner hides a note (hidden_at, returning id)');
select results_eq(
  $$ update public.spotlight_guestbook set hidden_at = null
      where id = '00000000-0000-4000-c758-000000000001' returning id $$,
  $$ values ('00000000-0000-4000-c758-000000000001'::uuid) $$,
  'the owner brings a note back (hidden_at = null)');

select throws_ok(
  $$ update public.spotlight_guestbook set message = 'rewritten by the owner'
      where id = '00000000-0000-4000-c758-000000000001' $$,
  '42501', null,
  'the owner cannot rewrite the note text');
select throws_ok(
  $$ update public.spotlight_guestbook set signer_profile_id = '00000000-0000-4000-b758-000000000003'
      where id = '00000000-0000-4000-c758-000000000001' $$,
  '42501', null,
  'the owner cannot move the note under another member''s name');
select throws_ok(
  $$ update public.spotlight_guestbook set created_at = now() - interval '1 year'
      where id = '00000000-0000-4000-c758-000000000001' $$,
  '42501', null,
  'the owner cannot backdate the note');
select throws_ok(
  $$ update public.spotlight_guestbook set hidden_at = now(), message = 'both at once'
      where id = '00000000-0000-4000-c758-000000000001' $$,
  '42501', null,
  'a hide that smuggles a message rewrite in the same statement is refused whole');

-- ── 3. The signer seat: still no update at all (RLS, zero rows) ─────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a758-000000000002', 'role', 'authenticated')::text, true);

select is_empty(
  $$ update public.spotlight_guestbook set hidden_at = null
      where id = '00000000-0000-4000-c758-000000000001' returning id $$,
  'the signer cannot touch hidden_at on their own note (RLS, no row)');

reset role;

select is(
  (select message from public.spotlight_guestbook where id = '00000000-0000-4000-c758-000000000001'),
  'what the signer wrote',
  'the note text is what the signer wrote, after every attempt above');

select * from finish();
rollback;
