-- Launch consent evidence retention (20270346027100_launch_consent_retention.sql, LIVE-1773).
--
-- Proved here, against a real database with every migration applied:
--   1. SHAPE: launch_id is nullable, both foreign keys are ON DELETE SET NULL, service_role can only
--      read and insert, signed-in and signed-out callers cannot edit or delete.
--   2. WRITE GUARD: a source from another Launch is refused, a supplied ref is corrected.
--   3. RETENTION: deleting the source, or the Launch, detaches the evidence and keeps wording, answer,
--      time and the original ids; the owner no longer sees it, a stranger never did.
--   4. IMMUTABLE: evidence fields cannot be rewritten, re-attached, or deleted, even by a role that
--      holds the table privilege.
-- One transaction, rolled back.

begin;
select plan(19);

insert into auth.users (id, email) values
  ('00000000-0000-4000-a300-000000000001', 'retain-owner@test.local'),
  ('00000000-0000-4000-a300-000000000002', 'retain-stranger@test.local');
insert into public.profiles (id, auth_user_id, display_name, handle) values
  ('00000000-0000-4000-b300-000000000001', '00000000-0000-4000-a300-000000000001', 'Retain Owner', 'retain-owner'),
  ('00000000-0000-4000-b300-000000000002', '00000000-0000-4000-a300-000000000002', 'Retain Stranger', 'retain-stranger');
delete from public.profiles
where auth_user_id in ('00000000-0000-4000-a300-000000000001', '00000000-0000-4000-a300-000000000002')
  and id not in ('00000000-0000-4000-b300-000000000001', '00000000-0000-4000-b300-000000000002');

insert into public.space_launch (id, owner_id) values
  ('00000000-0000-4000-d300-000000000001', '00000000-0000-4000-b300-000000000001'),
  ('00000000-0000-4000-d300-000000000002', '00000000-0000-4000-b300-000000000002');
insert into public.launch_sources (id, launch_id, kind, label) values
  ('00000000-0000-4000-d300-0000000000a1', '00000000-0000-4000-d300-000000000001', 'outline', 'mine'),
  ('00000000-0000-4000-d300-0000000000a2', '00000000-0000-4000-d300-000000000001', 'outline', 'mine too'),
  ('00000000-0000-4000-d300-0000000000b1', '00000000-0000-4000-d300-000000000002', 'outline', 'theirs');

-- 1. SHAPE
select is((select attnotnull from pg_attribute where attrelid = 'public.launch_list_attestations'::regclass and attname = 'launch_id'), false, 'launch_id is nullable');
select is(
  (select count(*)::int from pg_constraint where conrelid = 'public.launch_list_attestations'::regclass and contype = 'f' and confdeltype = 'n'),
  2, 'both foreign keys detach on delete');
select is(
  (select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'launch_list_attestations' and grantee = 'service_role'),
  'INSERT,SELECT', 'service_role can only read and insert consent evidence');
select is(
  has_table_privilege('authenticated', 'public.launch_list_attestations', 'update')
    or has_table_privilege('authenticated', 'public.launch_list_attestations', 'delete')
    or has_table_privilege('anon', 'public.launch_list_attestations', 'select'),
  false, 'browser roles cannot edit, delete or (signed out) read it');

-- 2. WRITE GUARD, as the owner
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-a300-000000000001')::text, true);
select throws_ok(
  $$ insert into public.launch_list_attestations (launch_id, source_id, wording_version, answer)
     values ('00000000-0000-4000-d300-000000000001', '00000000-0000-4000-d300-0000000000b1', 'v1', 'confirmed') $$,
  '23514', null, 'a source from another launch is refused');
select lives_ok(
  $$ insert into public.launch_list_attestations (id, launch_id, source_id, wording_version, answer, launch_ref, source_ref)
     values ('00000000-0000-4000-d300-0000000000c1', '00000000-0000-4000-d300-000000000001', '00000000-0000-4000-d300-0000000000a1', 'v1', 'confirmed',
             '00000000-0000-4000-d300-000000000099', '00000000-0000-4000-d300-000000000098') $$,
  'the owner records consent against their own source');
select lives_ok(
  $$ insert into public.launch_list_attestations (id, launch_id, source_id, wording_version, answer)
     values ('00000000-0000-4000-d300-0000000000c2', '00000000-0000-4000-d300-000000000001', '00000000-0000-4000-d300-0000000000a2', 'v1', 'declined') $$,
  'a second attestation on the same launch');
reset role;
select is(
  (select launch_ref::text || ' ' || source_ref::text from public.launch_list_attestations where id = '00000000-0000-4000-d300-0000000000c1'),
  '00000000-0000-4000-d300-000000000001 00000000-0000-4000-d300-0000000000a1',
  'supplied refs are corrected to the real ids');

-- 4. IMMUTABLE (as postgres, which holds every privilege, the trigger is the guard)
select throws_ok($$ update public.launch_list_attestations set answer = 'declined' where id = '00000000-0000-4000-d300-0000000000c1' $$,
  '42501', null, 'the answer cannot be rewritten');
select throws_ok($$ update public.launch_list_attestations set launch_ref = gen_random_uuid() where id = '00000000-0000-4000-d300-0000000000c1' $$,
  '42501', null, 'the original reference cannot be rewritten');
select throws_ok($$ update public.launch_list_attestations set launch_id = '00000000-0000-4000-d300-000000000002' where id = '00000000-0000-4000-d300-0000000000c1' $$,
  '42501', null, 'the evidence cannot be re-attached to another launch');
select throws_ok($$ delete from public.launch_list_attestations where id = '00000000-0000-4000-d300-0000000000c1' $$,
  '42501', null, 'the evidence cannot be deleted');

-- 3. RETENTION
delete from public.launch_sources where id = '00000000-0000-4000-d300-0000000000a1';
select is(
  (select source_id is null and source_ref = '00000000-0000-4000-d300-0000000000a1' and launch_id is not null and answer = 'confirmed' and wording_version = 'v1'
     from public.launch_list_attestations where id = '00000000-0000-4000-d300-0000000000c1'),
  true, 'deleting the source detaches it and keeps the evidence and the original source id');

delete from public.space_launch where id = '00000000-0000-4000-d300-000000000001';
select is(
  (select count(*)::int from public.launch_list_attestations where id in ('00000000-0000-4000-d300-0000000000c1', '00000000-0000-4000-d300-0000000000c2')),
  2, 'deleting the launch keeps both pieces of evidence');
select is(
  (select bool_and(launch_id is null and source_id is null and launch_ref = '00000000-0000-4000-d300-000000000001')
     from public.launch_list_attestations where id in ('00000000-0000-4000-d300-0000000000c1', '00000000-0000-4000-d300-0000000000c2')),
  true, 'the evidence is detached and keeps the original launch id');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-a300-000000000001')::text, true);
select is((select count(*)::int from public.launch_list_attestations), 0, 'the former owner no longer sees detached evidence');
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-a300-000000000002')::text, true);
select is((select count(*)::int from public.launch_list_attestations), 0, 'a stranger sees none');
reset role;

-- service_role holds no UPDATE or DELETE privilege at all
set local role service_role;
select throws_ok($$ update public.launch_list_attestations set answer = 'declined' $$, '42501', null, 'service_role cannot update it');
select throws_ok($$ delete from public.launch_list_attestations $$, '42501', null, 'service_role cannot delete it');
reset role;

select * from finish();
rollback;
