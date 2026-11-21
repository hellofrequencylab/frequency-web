-- EMAIL-071, migration 20270346260000_messages_insert_honors_blocks.sql.
--
-- A direct message is refused by the database when either person blocked the other, whichever side
-- did the blocking and whoever tries to send. Proven with each member's own session (the PostgREST
-- path a member could take around sendMessage), against a real database with the migrations applied:
--
--   1. A and C have no block: A's message to C lands.
--   2. B blocked A. A cannot see that row (blocked_users RLS shows a member only the blocks they
--      made), and A's message to B is still refused.
--   3. B, the blocker, cannot message A either.
--   4. The helper answers only about the caller's own conversations: true in A-B, false in A-C, and
--      false for C asking about A-B (C is not a participant), so it reveals nothing about others.
--   5. The catalog: one INSERT policy, the helper is SECURITY DEFINER, and anon/authenticated can run
--      it (the policy is for every role, so a missing grant would turn a refusal into an error).
--
-- One transaction, rolled back: nothing persists. Fixture style follows
-- conversation_one_to_one_and_co_steward_read.test.sql, including the auto-provisioned-profile
-- cleanup and fixture-table grants (a fresh local stack lacks the hosted platform's default grants;
-- the POLICY is what this file tests, not the grant baseline).

begin;
select plan(11);

-- ── Fixture (seeded as postgres, which RLS does not bind) ────────────────────────────────────────

insert into auth.users (id, email) values
  ('00000000-0000-4000-a071-000000000001', 'e071-a@test.local'),
  ('00000000-0000-4000-a071-000000000002', 'e071-b@test.local'),
  ('00000000-0000-4000-a071-000000000003', 'e071-c@test.local');

insert into public.profiles (id, auth_user_id, display_name, handle) values
  ('00000000-0000-4000-b071-000000000001', '00000000-0000-4000-a071-000000000001', 'E071 A', 'e071-a'),
  ('00000000-0000-4000-b071-000000000002', '00000000-0000-4000-a071-000000000002', 'E071 B', 'e071-b'),
  ('00000000-0000-4000-b071-000000000003', '00000000-0000-4000-a071-000000000003', 'E071 C', 'e071-c');

-- trg_on_auth_user_created auto-provisions a profile per auth.users row. Keep only the fixed ids.
delete from public.profiles
where auth_user_id::text like '00000000-0000-4000-a071-%'
  and id::text not like '00000000-0000-4000-b071-%';

-- Conversation 1 is A and B; conversation 2 is A and C.
insert into public.conversations (id) values
  ('00000000-0000-4000-c071-000000000001'),
  ('00000000-0000-4000-c071-000000000002');
insert into public.conversation_participants (conversation_id, profile_id) values
  ('00000000-0000-4000-c071-000000000001', '00000000-0000-4000-b071-000000000001'),
  ('00000000-0000-4000-c071-000000000001', '00000000-0000-4000-b071-000000000002'),
  ('00000000-0000-4000-c071-000000000002', '00000000-0000-4000-b071-000000000001'),
  ('00000000-0000-4000-c071-000000000002', '00000000-0000-4000-b071-000000000003');

-- B blocks A after the thread already existed.
insert into public.blocked_users (blocker_id, blocked_id) values
  ('00000000-0000-4000-b071-000000000002', '00000000-0000-4000-b071-000000000001');

grant select on public.profiles to anon, authenticated;
grant select, insert on public.messages to authenticated;
grant select on public.blocked_users to authenticated;

-- ── 5. Catalog ───────────────────────────────────────────────────────────────────────────────────

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'messages' and cmd = 'INSERT'),
  1,
  'messages keeps ONE insert policy (replaced, not stacked)');

select ok(
  (select prosecdef from pg_proc
    where oid = 'private.is_blocked_between_me_and_conversation(uuid)'::regprocedure),
  'the block helper is SECURITY DEFINER, so it sees blocks the sender did not make');

select is(has_function_privilege('authenticated', 'private.is_blocked_between_me_and_conversation(uuid)', 'execute'), true,
  'authenticated can run the helper the policy calls');
select is(has_function_privilege('anon', 'private.is_blocked_between_me_and_conversation(uuid)', 'execute'), true,
  'anon can run it too, so an anon insert is refused by the policy rather than erroring');

-- ── 1-3. Sends, by seat ──────────────────────────────────────────────────────────────────────────

set local role authenticated;

-- A, the blocked person.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a071-000000000001', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ insert into public.messages (conversation_id, sender_id, body) values
       ('00000000-0000-4000-c071-000000000002', '00000000-0000-4000-b071-000000000001', 'hi C') $$,
  'A messages C: no block, the message lands');

select is(
  (select count(*)::int from public.blocked_users),
  0,
  'A cannot see the block B made (the reason the helper must be SECURITY DEFINER)');

select throws_ok(
  $$ insert into public.messages (conversation_id, sender_id, body) values
       ('00000000-0000-4000-c071-000000000001', '00000000-0000-4000-b071-000000000001', 'hi B') $$,
  '42501',
  'new row violates row-level security policy for table "messages"',
  'A cannot message B, who blocked A, even in a thread from before the block');

select is(private.is_blocked_between_me_and_conversation('00000000-0000-4000-c071-000000000001'), true,
  'the helper answers true for A in the A-B thread');
select is(private.is_blocked_between_me_and_conversation('00000000-0000-4000-c071-000000000002'), false,
  'and false for A in the A-C thread');

-- B, the blocker.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a071-000000000002', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ insert into public.messages (conversation_id, sender_id, body) values
       ('00000000-0000-4000-c071-000000000001', '00000000-0000-4000-b071-000000000002', 'hi A') $$,
  '42501',
  'new row violates row-level security policy for table "messages"',
  'B, the blocker, cannot message A either: the block works both ways');

-- C, not in the A-B thread.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a071-000000000003', 'role', 'authenticated')::text, true);

select is(private.is_blocked_between_me_and_conversation('00000000-0000-4000-c071-000000000001'), false,
  'C learns nothing about the A-B block: the helper only answers for the caller''s own threads');

reset role;
select * from finish();
rollback;
