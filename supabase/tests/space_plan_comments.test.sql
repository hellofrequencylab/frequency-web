-- THE THREAD UNDER A SHARED PLAN (20270345009400_space_plan_comments.sql · LIVE-542 · PROG-CAL7).
--
-- Two Spaces work one Plan and talk about it here. This file proves the lock from both sides:
--
--   ADMITTED: the host writes on the Plan and under one of its to-dos; a guest holding an
--     ACCEPTED share reads those and writes its own; the host reads the guest's word back.
--   REFUSED: a guest cannot sign the host's name or write from the host's Space; a Space with
--     NO share reads nothing and cannot write; a Space with a PENDING share (offered, not yet
--     answered) reads nothing and cannot write, because the handshake is the lock; anon is
--     off the table entirely.
--   A RECORD: nobody updates a body (no update policy: 0 rows), nobody deletes (no delete policy:
--     0 rows); the author takes back their own comment through remove_plan_comment() and only
--     their own, and the taken-back row stays readable with removed_at set.
--   IN THE CATALOG: RLS is on, and there is no permissive UPDATE or DELETE policy at all, so a
--     behavioral pass above cannot be an accident of the fixture.
--
-- One transaction, rolled back: nothing persists. Fixture style follows
-- space_tenancy_walls.test.sql, including the auto-provisioned-profile cleanup and the
-- fixture-table grants (a fresh local stack lacks the hosted platform's default grants; the
-- POLICIES are what this file tests, not the grant baseline).

begin;
select plan(23);

-- ── Fixture (seeded as postgres, which RLS does not bind) ────────────────────────────────────────

insert into auth.users (id, email) values
  ('00000000-0000-4000-a400-000000000001', 'plc-host@test.local'),
  ('00000000-0000-4000-a400-000000000002', 'plc-guest@test.local'),
  ('00000000-0000-4000-a400-000000000003', 'plc-stranger@test.local'),
  ('00000000-0000-4000-a400-000000000004', 'plc-pending@test.local');

insert into public.profiles (id, auth_user_id, display_name, handle) values
  ('00000000-0000-4000-b400-000000000001', '00000000-0000-4000-a400-000000000001', 'PLC Host', 'plc-host'),
  ('00000000-0000-4000-b400-000000000002', '00000000-0000-4000-a400-000000000002', 'PLC Guest', 'plc-guest'),
  ('00000000-0000-4000-b400-000000000003', '00000000-0000-4000-a400-000000000003', 'PLC Stranger', 'plc-stranger'),
  ('00000000-0000-4000-b400-000000000004', '00000000-0000-4000-a400-000000000004', 'PLC Pending', 'plc-pending');

-- trg_on_auth_user_created auto-provisions a profile per auth.users row, so each seeded user has
-- TWO profiles and get_my_profile_id()'s scalar subquery would error. Keep only the fixed ids.
delete from public.profiles
where auth_user_id in (
    '00000000-0000-4000-a400-000000000001',
    '00000000-0000-4000-a400-000000000002',
    '00000000-0000-4000-a400-000000000003',
    '00000000-0000-4000-a400-000000000004')
  and id not in (
    '00000000-0000-4000-b400-000000000001',
    '00000000-0000-4000-b400-000000000002',
    '00000000-0000-4000-b400-000000000003',
    '00000000-0000-4000-b400-000000000004');

insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');

-- Four Spaces, each owned by its seat: the host, the accepted guest, a stranger, a pending guest.
insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility) values
  ('00000000-0000-4000-c400-00000000000a', 'plc-host-space', 'PLC Host Space', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b400-000000000001', 'active', 'network'),
  ('00000000-0000-4000-c400-00000000000b', 'plc-guest-space', 'PLC Guest Space', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b400-000000000002', 'active', 'network'),
  ('00000000-0000-4000-c400-00000000000c', 'plc-stranger-space', 'PLC Stranger Space', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b400-000000000003', 'active', 'network'),
  ('00000000-0000-4000-c400-00000000000d', 'plc-pending-space', 'PLC Pending Space', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b400-000000000004', 'active', 'network');

-- One Plan of the host's, with one to-do, offered to two Spaces: accepted by the guest, still
-- pending with the fourth seat.
insert into public.space_plans (id, space_id, title, stage) values
  ('00000000-0000-4000-e400-000000000001', '00000000-0000-4000-c400-00000000000a', 'PLC Autumn retreat', 'plan');

insert into public.crm_tasks (id, space_id, plan_id, title) values
  ('00000000-0000-4000-f400-000000000001', '00000000-0000-4000-c400-00000000000a',
   '00000000-0000-4000-e400-000000000001', 'Book the hall');

insert into public.space_plan_shares (plan_id, guest_space_id, status, requested_by) values
  ('00000000-0000-4000-e400-000000000001', '00000000-0000-4000-c400-00000000000b', 'accepted',
   '00000000-0000-4000-b400-000000000001'),
  ('00000000-0000-4000-e400-000000000001', '00000000-0000-4000-c400-00000000000d', 'pending',
   '00000000-0000-4000-b400-000000000001');

-- A fresh local stack applies migrations as postgres WITHOUT the hosted platform's
-- default-privilege grants to anon/authenticated. The POLICIES are what this file tests, so
-- grant the fixture tables inside this rolled-back transaction. space_plan_comments is granted
-- to authenticated ONLY: the migration revokes it from anon, and that revocation is under test.
grant select, insert, update, delete on
  public.space_plans, public.space_plan_shares, public.crm_tasks, public.spaces
to anon, authenticated;
grant select, insert, update, delete on public.space_plan_comments to authenticated;

-- ── Seat 1: the host ─────────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a400-000000000001', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ insert into space_plan_comments (id, plan_id, task_id, space_id, author_profile_id, body)
     values ('00000000-0000-4000-d400-000000000001', '00000000-0000-4000-e400-000000000001', null,
             '00000000-0000-4000-c400-00000000000a', '00000000-0000-4000-b400-000000000001',
             'Doors at seven?') $$,
  'the host writes on the Plan');

select lives_ok(
  $$ insert into space_plan_comments (id, plan_id, task_id, space_id, author_profile_id, body)
     values ('00000000-0000-4000-d400-000000000002', '00000000-0000-4000-e400-000000000001',
             '00000000-0000-4000-f400-000000000001',
             '00000000-0000-4000-c400-00000000000a', '00000000-0000-4000-b400-000000000001',
             'The hall wants a deposit by Friday.') $$,
  'the host writes under one of the to-dos');

select results_eq(
  $$ select count(*)::int from space_plan_comments $$, $$ values (2) $$,
  'the host reads both of its comments');

-- ── Seat 2: the guest holding an ACCEPTED share ──────────────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a400-000000000002', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select count(*)::int from space_plan_comments $$, $$ values (2) $$,
  'the accepted guest reads the host''s two comments');

select lives_ok(
  $$ insert into space_plan_comments (id, plan_id, task_id, space_id, author_profile_id, body)
     values ('00000000-0000-4000-d400-000000000003', '00000000-0000-4000-e400-000000000001', null,
             '00000000-0000-4000-c400-00000000000b', '00000000-0000-4000-b400-000000000002',
             'Seven works for us.') $$,
  'the accepted guest writes on the Plan from its own Space, as itself');

select throws_ok(
  $$ insert into space_plan_comments (plan_id, space_id, author_profile_id, body)
     values ('00000000-0000-4000-e400-000000000001', '00000000-0000-4000-c400-00000000000b',
             '00000000-0000-4000-b400-000000000001', 'Signed as the host') $$,
  '42501',
  'new row violates row-level security policy for table "space_plan_comments"',
  'the guest cannot sign the host''s name');

select throws_ok(
  $$ insert into space_plan_comments (plan_id, space_id, author_profile_id, body)
     values ('00000000-0000-4000-e400-000000000001', '00000000-0000-4000-c400-00000000000a',
             '00000000-0000-4000-b400-000000000002', 'From the host Space') $$,
  '42501',
  'new row violates row-level security policy for table "space_plan_comments"',
  'the guest cannot write from the host''s Space');

select results_eq(
  $$ with u as (update space_plan_comments set body = 'rewritten'
                where id = '00000000-0000-4000-d400-000000000001' returning id)
     select count(*)::int from u $$,
  $$ values (0) $$,
  'no update policy: the guest rewrites nothing');

select results_eq(
  $$ with u as (update space_plan_comments set body = 'rewritten'
                where id = '00000000-0000-4000-d400-000000000003' returning id)
     select count(*)::int from u $$,
  $$ values (0) $$,
  'no update policy: not even the author rewrites their own body');

select results_eq(
  $$ with d as (delete from space_plan_comments
                where id = '00000000-0000-4000-d400-000000000001' returning id)
     select count(*)::int from d $$,
  $$ values (0) $$,
  'no delete policy: the guest deletes nothing');

select results_eq(
  $$ select public.remove_plan_comment('00000000-0000-4000-d400-000000000003') $$,
  $$ values (true) $$,
  'the author takes back their own comment');

select results_eq(
  $$ select public.remove_plan_comment('00000000-0000-4000-d400-000000000001') $$,
  $$ values (false) $$,
  'the author cannot take back the host''s comment');

select results_eq(
  $$ select public.remove_plan_comment('00000000-0000-4000-d400-000000000003') $$,
  $$ values (false) $$,
  'a comment already taken back is not marked twice');

-- ── Seat 1 again: the host reads the guest's word and the tombstone ──────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a400-000000000001', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select count(*)::int from space_plan_comments $$, $$ values (3) $$,
  'the host reads the guest''s comment back, the taken-back row included');

select results_eq(
  $$ select (removed_at is not null), removed_by from space_plan_comments
     where id = '00000000-0000-4000-d400-000000000003' $$,
  $$ values (true, '00000000-0000-4000-b400-000000000002'::uuid) $$,
  'the taken-back row carries removed_at and the author as removed_by');

select results_eq(
  $$ with d as (delete from space_plan_comments
                where id = '00000000-0000-4000-d400-000000000003' returning id)
     select count(*)::int from d $$,
  $$ values (0) $$,
  'no delete policy: the host deletes nothing either');

-- ── Seat 3: a Space with NO share ────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a400-000000000003', 'role', 'authenticated')::text, true);

select is_empty(
  $$ select id from space_plan_comments $$,
  'a Space with no share reads nothing');

select throws_ok(
  $$ insert into space_plan_comments (plan_id, space_id, author_profile_id, body)
     values ('00000000-0000-4000-e400-000000000001', '00000000-0000-4000-c400-00000000000c',
             '00000000-0000-4000-b400-000000000003', 'Hello from nowhere') $$,
  '42501',
  'new row violates row-level security policy for table "space_plan_comments"',
  'a Space with no share cannot write');

-- ── Seat 4: a Space with a PENDING share ─────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a400-000000000004', 'role', 'authenticated')::text, true);

select is_empty(
  $$ select id from space_plan_comments $$,
  'a pending offer opens nothing: the guest reads no comment until it says yes');

select throws_ok(
  $$ insert into space_plan_comments (plan_id, space_id, author_profile_id, body)
     values ('00000000-0000-4000-e400-000000000001', '00000000-0000-4000-c400-00000000000d',
             '00000000-0000-4000-b400-000000000004', 'Before saying yes') $$,
  '42501',
  'new row violates row-level security policy for table "space_plan_comments"',
  'a pending guest cannot write');

-- ── anon: off the table ──────────────────────────────────────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

select throws_ok(
  $$ select id from space_plan_comments $$,
  '42501',
  'permission denied for table space_plan_comments',
  'anon has no grant on the thread at all');

-- ── The catalog ──────────────────────────────────────────────────────────────────────────────────
reset role;

select ok(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'space_plan_comments'),
  'RLS is on for space_plan_comments');

select is_empty(
  $$ select policyname from pg_policies
     where schemaname = 'public' and tablename = 'space_plan_comments'
       and cmd in ('UPDATE', 'DELETE') $$,
  'no UPDATE or DELETE policy exists on space_plan_comments: a comment is a record');

select * from finish();
rollback;
