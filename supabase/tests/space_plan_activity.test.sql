-- THE PLAN'S OWN RECORD (20270345009410_space_plan_activity.sql · LIVE-543 · PROG-CAL7).
--
-- Who did what to a Plan two Spaces work. This file proves the lock from both sides:
--   ADMITTED: the host records a change; the accepted guest reads it and records its own; the host
--     reads the guest's row back.
--   REFUSED: the guest cannot sign the host's name or act from the host's Space; a Space with no
--     share and a Space with a PENDING share read nothing and cannot write; anon is off the table.
--   A RECORD: nobody updates (0 rows, the author included) and nobody deletes (0 rows); the
--     catalog holds no UPDATE or DELETE policy at all.
-- One transaction, rolled back. Fixture style follows space_plan_comments.test.sql.

begin;
select plan(14);

insert into auth.users (id, email) values
  ('00000000-0000-4000-a410-000000000001', 'pla-host@test.local'),
  ('00000000-0000-4000-a410-000000000002', 'pla-guest@test.local'),
  ('00000000-0000-4000-a410-000000000003', 'pla-stranger@test.local'),
  ('00000000-0000-4000-a410-000000000004', 'pla-pending@test.local');

insert into public.profiles (id, auth_user_id, display_name, handle) values
  ('00000000-0000-4000-b410-000000000001', '00000000-0000-4000-a410-000000000001', 'PLA Host', 'pla-host'),
  ('00000000-0000-4000-b410-000000000002', '00000000-0000-4000-a410-000000000002', 'PLA Guest', 'pla-guest'),
  ('00000000-0000-4000-b410-000000000003', '00000000-0000-4000-a410-000000000003', 'PLA Stranger', 'pla-stranger'),
  ('00000000-0000-4000-b410-000000000004', '00000000-0000-4000-a410-000000000004', 'PLA Pending', 'pla-pending');

delete from public.profiles
where auth_user_id in (
    '00000000-0000-4000-a410-000000000001',
    '00000000-0000-4000-a410-000000000002',
    '00000000-0000-4000-a410-000000000003',
    '00000000-0000-4000-a410-000000000004')
  and id not in (
    '00000000-0000-4000-b410-000000000001',
    '00000000-0000-4000-b410-000000000002',
    '00000000-0000-4000-b410-000000000003',
    '00000000-0000-4000-b410-000000000004');

insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');

insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility) values
  ('00000000-0000-4000-c410-00000000000a', 'pla-host-space', 'PLA Host Space', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b410-000000000001', 'active', 'network'),
  ('00000000-0000-4000-c410-00000000000b', 'pla-guest-space', 'PLA Guest Space', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b410-000000000002', 'active', 'network'),
  ('00000000-0000-4000-c410-00000000000c', 'pla-stranger-space', 'PLA Stranger Space', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b410-000000000003', 'active', 'network'),
  ('00000000-0000-4000-c410-00000000000d', 'pla-pending-space', 'PLA Pending Space', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b410-000000000004', 'active', 'network');

insert into public.space_plans (id, space_id, title, stage) values
  ('00000000-0000-4000-e410-000000000001', '00000000-0000-4000-c410-00000000000a', 'PLA Autumn retreat', 'plan');

insert into public.space_plan_shares (plan_id, guest_space_id, status, requested_by) values
  ('00000000-0000-4000-e410-000000000001', '00000000-0000-4000-c410-00000000000b', 'accepted',
   '00000000-0000-4000-b410-000000000001'),
  ('00000000-0000-4000-e410-000000000001', '00000000-0000-4000-c410-00000000000d', 'pending',
   '00000000-0000-4000-b410-000000000001');

grant select, insert, update, delete on
  public.space_plans, public.space_plan_shares, public.spaces
to anon, authenticated;
grant select, insert, update, delete on public.space_plan_activity to authenticated;

-- ── The host ─────────────────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a410-000000000001', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ insert into space_plan_activity (id, plan_id, actor_profile_id, actor_space_id, kind, summary)
     values ('00000000-0000-4000-d410-000000000001', '00000000-0000-4000-e410-000000000001',
             '00000000-0000-4000-b410-000000000001', '00000000-0000-4000-c410-00000000000a',
             'stage', 'Moved the Plan to Production.') $$,
  'the host records a change to its Plan');

select throws_ok(
  $$ insert into space_plan_activity (plan_id, actor_profile_id, actor_space_id, kind, summary)
     values ('00000000-0000-4000-e410-000000000001', '00000000-0000-4000-b410-000000000001',
             '00000000-0000-4000-c410-00000000000a', 'rewrote_history', 'x') $$,
  '23514',
  'a kind outside the closed set is refused by the check');

-- ── The accepted guest ───────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a410-000000000002', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select summary from space_plan_activity $$, $$ values ('Moved the Plan to Production.') $$,
  'the accepted guest reads what the host did');

select lives_ok(
  $$ insert into space_plan_activity (id, plan_id, actor_profile_id, actor_space_id, kind, summary)
     values ('00000000-0000-4000-d410-000000000002', '00000000-0000-4000-e410-000000000001',
             '00000000-0000-4000-b410-000000000002', '00000000-0000-4000-c410-00000000000b',
             'comment', 'Commented on the Plan.') $$,
  'the accepted guest records its own change, from its own Space, as itself');

select throws_ok(
  $$ insert into space_plan_activity (plan_id, actor_profile_id, actor_space_id, kind, summary)
     values ('00000000-0000-4000-e410-000000000001', '00000000-0000-4000-b410-000000000001',
             '00000000-0000-4000-c410-00000000000b', 'comment', 'Signed as the host') $$,
  '42501',
  'new row violates row-level security policy for table "space_plan_activity"',
  'the guest cannot sign the host''s name');

select throws_ok(
  $$ insert into space_plan_activity (plan_id, actor_profile_id, actor_space_id, kind, summary)
     values ('00000000-0000-4000-e410-000000000001', '00000000-0000-4000-b410-000000000002',
             '00000000-0000-4000-c410-00000000000a', 'comment', 'From the host Space') $$,
  '42501',
  'new row violates row-level security policy for table "space_plan_activity"',
  'the guest cannot act from the host''s Space');

select results_eq(
  $$ with u as (update space_plan_activity set summary = 'rewritten'
                where id = '00000000-0000-4000-d410-000000000002' returning id)
     select count(*)::int from u $$,
  $$ values (0) $$,
  'no update policy: not even the author rewrites a row');

select results_eq(
  $$ with d as (delete from space_plan_activity
                where id = '00000000-0000-4000-d410-000000000001' returning id)
     select count(*)::int from d $$,
  $$ values (0) $$,
  'no delete policy: the guest deletes nothing');

-- ── The host reads the guest's row back ──────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a410-000000000001', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select count(*)::int from space_plan_activity $$, $$ values (2) $$,
  'the host reads both rows, the guest''s included');

select results_eq(
  $$ with d as (delete from space_plan_activity returning id) select count(*)::int from d $$,
  $$ values (0) $$,
  'no delete policy: the host deletes nothing either');

-- ── No share, and a pending share ────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a410-000000000003', 'role', 'authenticated')::text, true);
select is_empty($$ select id from space_plan_activity $$, 'a Space with no share reads nothing');

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a410-000000000004', 'role', 'authenticated')::text, true);
select is_empty($$ select id from space_plan_activity $$, 'a pending offer opens nothing');
select throws_ok(
  $$ insert into space_plan_activity (plan_id, actor_profile_id, actor_space_id, kind, summary)
     values ('00000000-0000-4000-e410-000000000001', '00000000-0000-4000-b410-000000000004',
             '00000000-0000-4000-c410-00000000000d', 'comment', 'Before saying yes') $$,
  '42501',
  'new row violates row-level security policy for table "space_plan_activity"',
  'a pending guest cannot write');

-- ── The catalog ──────────────────────────────────────────────────────────────────────────────────
reset role;
select is_empty(
  $$ select policyname from pg_policies
     where schemaname = 'public' and tablename = 'space_plan_activity'
       and cmd in ('UPDATE', 'DELETE') $$,
  'no UPDATE or DELETE policy exists on space_plan_activity: it is a record');

select * from finish();
rollback;
