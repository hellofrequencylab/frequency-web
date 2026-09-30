-- THE LOOM DOWNLOAD RECORD (20270345009560_library_downloads.sql · LIVE-578 · ADR-1596).
--
-- The download door writes one row here before it hands out a file. This file proves, after a
-- fresh apply, that the record is a record:
--   NO WRITE POLICY: no insert, update or delete policy exists on the table, for any role.
--   NOBODY BUT STAFF READS IT: anon and a signed-in member read nothing; platform staff read it.
--   NOBODY REWRITES IT: anon, a member and staff are all refused an insert, an update and a delete
--     (42501), so the only writer is the service role the door runs as.
-- Fixture style follows circle_privacy.test.sql. One transaction, rolled back.

begin;
select plan(13);

-- ── Fixture (seeded as postgres, which RLS does not bind) ────────────────────────────────────────

insert into auth.users (id, email) values
  ('00000000-0000-4000-a578-000000000001', 'dl-member@test.local'),
  ('00000000-0000-4000-a578-000000000002', 'dl-staff@test.local');

insert into public.profiles (id, auth_user_id, display_name, handle) values
  ('00000000-0000-4000-b578-000000000001', '00000000-0000-4000-a578-000000000001', 'Download Member', 'dl-member'),
  ('00000000-0000-4000-b578-000000000002', '00000000-0000-4000-a578-000000000002', 'Download Staff', 'dl-staff');

-- trg_on_auth_user_created auto-provisions a profile per auth.users row; keep only the fixed ids so
-- get_my_web_role()'s lookup sees one row.
delete from public.profiles
where auth_user_id in ('00000000-0000-4000-a578-000000000001', '00000000-0000-4000-a578-000000000002')
  and id not in ('00000000-0000-4000-b578-000000000001', '00000000-0000-4000-b578-000000000002');

update public.profiles set web_role = 'janitor'
where id = '00000000-0000-4000-b578-000000000002';

insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');

insert into public.spaces (id, slug, name, type, entity_id, status, visibility)
select '00000000-0000-4000-c578-0000000000cc'::uuid, 'dl-root', 'Download Root', 'root',
       (select id from public.entities where key = 'labs' limit 1), 'active', 'network'
where not exists (select 1 from public.spaces where type = 'root');

insert into public.library_assets (id, kind, title, slug, space_id, storage_bucket, storage_path, is_protected, download_policy)
values ('00000000-0000-4000-d578-000000000001', 'image', 'Protected original', 'dl-protected',
        (select id from public.spaces where type = 'root' order by created_at limit 1),
        'library-private', 'root/dl-protected.png', true, 'members');

insert into public.library_downloads (asset_id, profile_id, policy)
values ('00000000-0000-4000-d578-000000000001', '00000000-0000-4000-b578-000000000001', 'members');

-- The local stack may not carry Supabase's default table grants; grant select the way production's
-- default privileges do, so every read below is a statement about the POLICY. The migration's own
-- revokes on the write commands stay in force.
grant select on public.library_downloads to authenticated;

-- ── 1. The shape of the policy set ─────────────────────────────────────────────────────────────
select ok(
  (select relrowsecurity from pg_class where oid = 'public.library_downloads'::regclass),
  'row level security is on for library_downloads'
);

select is_empty(
  $$ select policyname from pg_policies
     where schemaname = 'public' and tablename = 'library_downloads'
       and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL') $$,
  'no insert, update or delete policy exists: the service role is the only writer'
);

-- ── 2. anon ────────────────────────────────────────────────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

select throws_ok(
  $$ select id from library_downloads $$,
  '42501', null, 'anon cannot read the download record'
);
select throws_ok(
  $$ insert into library_downloads (asset_id, policy) values ('00000000-0000-4000-d578-000000000001', 'open') $$,
  '42501', null, 'anon cannot write a download row'
);
reset role;

-- ── 3. a signed-in member (the person the one row names) ──────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a578-000000000001', 'role', 'authenticated')::text, true);

select is_empty($$ select id from library_downloads $$, 'a member reads no download row, not even their own');
select throws_ok(
  $$ insert into library_downloads (asset_id, profile_id, policy)
     values ('00000000-0000-4000-d578-000000000001', '00000000-0000-4000-b578-000000000001', 'open') $$,
  '42501', null, 'a member cannot write a download row'
);
select throws_ok(
  $$ delete from library_downloads $$,
  '42501', null, 'a member cannot delete the record of their download'
);
reset role;

-- ── 4. platform staff ──────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a578-000000000002', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select count(*)::int from library_downloads $$,
  $$ values (1) $$,
  'staff read the download record'
);
select throws_ok(
  $$ update library_downloads set policy = 'open' $$,
  '42501', null, 'staff cannot rewrite the policy a download happened under'
);
select throws_ok(
  $$ delete from library_downloads $$,
  '42501', null, 'staff cannot delete a download row'
);
select throws_ok(
  $$ insert into library_downloads (asset_id, policy) values ('00000000-0000-4000-d578-000000000001', 'staff') $$,
  '42501', null, 'staff cannot invent a download row'
);
reset role;

-- ── 5. The record survives every attempt above, and follows its asset ─────────────────────────
select results_eq(
  $$ select policy from public.library_downloads where asset_id = '00000000-0000-4000-d578-000000000001' $$,
  $$ values ('members'::text) $$,
  'the one row is still there, unchanged'
);

delete from public.library_assets where id = '00000000-0000-4000-d578-000000000001';
select is_empty(
  $$ select id from public.library_downloads where asset_id = '00000000-0000-4000-d578-000000000001' $$,
  'deleting the asset takes its download history with it (on delete cascade)'
);

select * from finish();
rollback;
