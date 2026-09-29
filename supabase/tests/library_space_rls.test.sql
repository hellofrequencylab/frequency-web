-- THE LOOM'S DATABASE WALL (20270345009500_loom_space_rls.sql · LIVE-570 · ADR-1594).
--
-- Two Spaces and the root Space each hold Loom rows. This file proves the wall from every seat:
--
--   READ: a plain (viewer) member of A reads A's rows, any visibility, and the root's PUBLIC row,
--     and nothing of B's; a signed-in stranger reads only the public row; platform staff read B's
--     private rows; collection items and versions follow their parent's Space; anon has no
--     grant on any of the four tables.
--   WRITE: A's owner writes into A, signed as itself, and cannot sign as someone else, write into
--     B, or file B's private asset into A's collection; a viewer of A cannot write at all; an
--     editor of B updates and deletes nothing of A's and cannot move a B row into A, while it
--     still edits its own (the positive control).
--   A RECORD: the team that wrote a version cannot update or delete it, because there is no
--     policy and no grant for either command.
--   IN THE CATALOG: no UPDATE or DELETE policy or privilege on library_versions, and
--     library_styles is still service-role only.
--
-- One transaction, rolled back: nothing persists. Fixture style follows space_plan_comments.test.sql
-- and space_tenancy_walls.test.sql, including the auto-provisioned-profile cleanup. No fixture
-- grants: the migration grants authenticated exactly what it has policies for, and that grant
-- is part of what is under test.

begin;
select plan(34);

-- ── Fixture (seeded as postgres, which RLS does not bind) ────────────────────────────────────────

insert into auth.users (id, email) values
  ('00000000-0000-4000-a570-000000000001', 'loom-owner-a@test.local'),
  ('00000000-0000-4000-a570-000000000002', 'loom-viewer-a@test.local'),
  ('00000000-0000-4000-a570-000000000003', 'loom-editor-b@test.local'),
  ('00000000-0000-4000-a570-000000000004', 'loom-stranger@test.local'),
  ('00000000-0000-4000-a570-000000000005', 'loom-janitor@test.local');

insert into public.profiles (id, auth_user_id, display_name, handle) values
  ('00000000-0000-4000-b570-000000000001', '00000000-0000-4000-a570-000000000001', 'Loom Owner A', 'loom-owner-a'),
  ('00000000-0000-4000-b570-000000000002', '00000000-0000-4000-a570-000000000002', 'Loom Viewer A', 'loom-viewer-a'),
  ('00000000-0000-4000-b570-000000000003', '00000000-0000-4000-a570-000000000003', 'Loom Editor B', 'loom-editor-b'),
  ('00000000-0000-4000-b570-000000000004', '00000000-0000-4000-a570-000000000004', 'Loom Stranger', 'loom-stranger'),
  ('00000000-0000-4000-b570-000000000005', '00000000-0000-4000-a570-000000000005', 'Loom Janitor', 'loom-janitor');

-- trg_on_auth_user_created auto-provisions a profile per auth.users row, so each seeded user has
-- TWO profiles and get_my_profile_id()'s scalar subquery would error. Keep only the fixed ids.
delete from public.profiles
where auth_user_id in (
    '00000000-0000-4000-a570-000000000001', '00000000-0000-4000-a570-000000000002',
    '00000000-0000-4000-a570-000000000003', '00000000-0000-4000-a570-000000000004',
    '00000000-0000-4000-a570-000000000005')
  and id not in (
    '00000000-0000-4000-b570-000000000001', '00000000-0000-4000-b570-000000000002',
    '00000000-0000-4000-b570-000000000003', '00000000-0000-4000-b570-000000000004',
    '00000000-0000-4000-b570-000000000005');

update public.profiles set web_role = 'janitor'
where id = '00000000-0000-4000-b570-000000000005';

insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');

-- The root Space holds the shared library. Reuse it if the stack already has one.
insert into public.spaces (id, slug, name, type, entity_id, status, visibility)
select '00000000-0000-4000-c570-0000000000cc'::uuid, 'loom-root', 'Loom Root', 'root',
       (select id from public.entities where key = 'labs' limit 1), 'active', 'network'
where not exists (select 1 from public.spaces where type = 'root');

-- A is owned by seat 1 with seat 2 as a viewer. B has no owner; seat 3 is its editor.
insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility) values
  ('00000000-0000-4000-c570-00000000000a', 'loom-space-a', 'Loom Space A', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b570-000000000001', 'active', 'network'),
  ('00000000-0000-4000-c570-00000000000b', 'loom-space-b', 'Loom Space B', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   null, 'active', 'network');

insert into public.space_members (space_id, profile_id, role, status) values
  ('00000000-0000-4000-c570-00000000000a', '00000000-0000-4000-b570-000000000002', 'viewer', 'active'),
  ('00000000-0000-4000-c570-00000000000b', '00000000-0000-4000-b570-000000000003', 'editor', 'active');

-- Six assets: two in A, two in B, and a public and a team-only row in the root's shared library.
insert into public.library_assets (id, kind, title, slug, space_id, visibility, status) values
  ('00000000-0000-4000-e570-000000000001', 'image', 'A team photo', 'loom-a-space',
   '00000000-0000-4000-c570-00000000000a', 'space', 'approved'),
  ('00000000-0000-4000-e570-000000000002', 'image', 'A private draft', 'loom-a-private',
   '00000000-0000-4000-c570-00000000000a', 'private', 'draft'),
  ('00000000-0000-4000-e570-000000000003', 'image', 'B private photo', 'loom-b-private',
   '00000000-0000-4000-c570-00000000000b', 'private', 'approved'),
  ('00000000-0000-4000-e570-000000000004', 'image', 'B team photo', 'loom-b-space',
   '00000000-0000-4000-c570-00000000000b', 'space', 'approved');

insert into public.library_assets (id, kind, title, slug, space_id, visibility, status)
select v.id, 'image', v.title, v.slug,
       (select id from public.spaces where type = 'root' order by created_at asc limit 1),
       v.visibility, 'approved'
from (values
  ('00000000-0000-4000-e570-000000000005'::uuid, 'Root shared photo', 'loom-root-public', 'public'),
  ('00000000-0000-4000-e570-000000000006'::uuid, 'Root team photo', 'loom-root-space', 'space')
) as v(id, title, slug, visibility);

insert into public.library_collections (id, space_id, title, slug) values
  ('00000000-0000-4000-f570-00000000000a', '00000000-0000-4000-c570-00000000000a', 'A moodboard', 'loom-a-board'),
  ('00000000-0000-4000-f570-00000000000b', '00000000-0000-4000-c570-00000000000b', 'B moodboard', 'loom-b-board');

insert into public.library_collection_items (collection_id, asset_id) values
  ('00000000-0000-4000-f570-00000000000a', '00000000-0000-4000-e570-000000000001'),
  ('00000000-0000-4000-f570-00000000000b', '00000000-0000-4000-e570-000000000003');

insert into public.library_versions (id, asset_id, version, is_current, created_by) values
  ('00000000-0000-4000-d570-000000000001', '00000000-0000-4000-e570-000000000001', 1, true,
   '00000000-0000-4000-b570-000000000001'),
  ('00000000-0000-4000-d570-000000000002', '00000000-0000-4000-e570-000000000003', 1, true,
   '00000000-0000-4000-b570-000000000003');

-- ── Seat 2: a viewer of A ────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a570-000000000002', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select id from library_assets where id::text like '00000000-0000-4000-e570-%' order by id $$,
  $$ values ('00000000-0000-4000-e570-000000000001'::uuid),
            ('00000000-0000-4000-e570-000000000002'::uuid),
            ('00000000-0000-4000-e570-000000000005'::uuid) $$,
  'a member of A reads both of A''s assets, the private one included, and the root''s public one');

select is_empty(
  $$ select id from library_assets where space_id = '00000000-0000-4000-c570-00000000000b' $$,
  'a member of A reads none of B''s assets');

select results_eq(
  $$ select id from library_collections where id::text like '00000000-0000-4000-f570-%' $$,
  $$ values ('00000000-0000-4000-f570-00000000000a'::uuid) $$,
  'a member of A reads A''s collection and not B''s');

select results_eq(
  $$ select collection_id from library_collection_items
     where collection_id::text like '00000000-0000-4000-f570-%' $$,
  $$ values ('00000000-0000-4000-f570-00000000000a'::uuid) $$,
  'collection items follow their collection''s Space');

select results_eq(
  $$ select id from library_versions where id::text like '00000000-0000-4000-d570-%' $$,
  $$ values ('00000000-0000-4000-d570-000000000001'::uuid) $$,
  'versions follow their asset''s Space');

select throws_ok(
  $$ insert into library_assets (kind, title, slug, space_id)
     values ('image', 'Viewer upload', 'loom-viewer-upload', '00000000-0000-4000-c570-00000000000a') $$,
  '42501', null,
  'a viewer of A reads the Loom but cannot write to it');

-- ── Seat 1: A's owner ────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a570-000000000001', 'role', 'authenticated')::text, true);

select lives_ok(
  $$ insert into library_assets (id, kind, title, slug, space_id, created_by)
     values ('00000000-0000-4000-e570-000000000007', 'image', 'Owner upload', 'loom-owner-upload',
             '00000000-0000-4000-c570-00000000000a', '00000000-0000-4000-b570-000000000001') $$,
  'A''s owner uploads into A, signed as itself');

select throws_ok(
  $$ insert into library_assets (kind, title, slug, space_id, created_by)
     values ('image', 'Forged upload', 'loom-forged-upload',
             '00000000-0000-4000-c570-00000000000a', '00000000-0000-4000-b570-000000000002') $$,
  '42501', null,
  'A''s owner cannot sign an upload with someone else''s name');

select throws_ok(
  $$ insert into library_assets (kind, title, slug, space_id)
     values ('image', 'Into B', 'loom-into-b', '00000000-0000-4000-c570-00000000000b') $$,
  '42501', null,
  'A''s owner cannot write into B''s Loom');

select throws_ok(
  $$ insert into library_collection_items (collection_id, asset_id)
     values ('00000000-0000-4000-f570-00000000000a', '00000000-0000-4000-e570-000000000003') $$,
  '42501', null,
  'A''s owner cannot file B''s private asset into A''s collection');

select lives_ok(
  $$ insert into library_collection_items (collection_id, asset_id)
     values ('00000000-0000-4000-f570-00000000000a', '00000000-0000-4000-e570-000000000005') $$,
  'A''s owner files the root''s public asset into A''s collection');

select lives_ok(
  $$ insert into library_versions (asset_id, version, is_current, created_by)
     values ('00000000-0000-4000-e570-000000000001', 2, false, '00000000-0000-4000-b570-000000000001') $$,
  'A''s owner records a new version of A''s asset');

select throws_ok(
  $$ update library_versions set note = 'rewritten' where id = '00000000-0000-4000-d570-000000000001' $$,
  '42501', null,
  'the team that wrote a version cannot update it');

select throws_ok(
  $$ delete from library_versions where id = '00000000-0000-4000-d570-000000000001' $$,
  '42501', null,
  'the team that wrote a version cannot delete it');

-- ── Seat 3: B's editor ───────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a570-000000000003', 'role', 'authenticated')::text, true);

select results_eq(
  $$ with u as (update library_assets set title = 'Taken'
                where id = '00000000-0000-4000-e570-000000000001' returning id)
     select count(*)::int from u $$,
  $$ values (0) $$,
  'a B editor updates nothing of A''s');

select results_eq(
  $$ with d as (delete from library_assets
                where id = '00000000-0000-4000-e570-000000000001' returning id)
     select count(*)::int from d $$,
  $$ values (0) $$,
  'a B editor deletes nothing of A''s');

select throws_ok(
  $$ update library_assets set space_id = '00000000-0000-4000-c570-00000000000a'
     where id = '00000000-0000-4000-e570-000000000003' $$,
  '42501', null,
  'a B editor cannot move a B row into A');

select results_eq(
  $$ with u as (update library_assets set title = 'B private photo, cropped'
                where id = '00000000-0000-4000-e570-000000000003' returning id)
     select count(*)::int from u $$,
  $$ values (1) $$,
  'a B editor still edits B''s own asset');

select is_empty(
  $$ select id from library_collections where space_id = '00000000-0000-4000-c570-00000000000a' $$,
  'a B editor reads none of A''s collections');

-- ── Seat 4: a signed-in stranger ─────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a570-000000000004', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select id from library_assets where id::text like '00000000-0000-4000-e570-%' order by id $$,
  $$ values ('00000000-0000-4000-e570-000000000005'::uuid) $$,
  'a stranger reads the shared public asset and nothing else');

select is_empty(
  $$ select id from library_collections where id::text like '00000000-0000-4000-f570-%' $$,
  'a stranger reads no collection');

select is_empty(
  $$ select asset_id from library_collection_items where collection_id::text like '00000000-0000-4000-f570-%' $$,
  'a stranger reads no collection item, the public asset''s included');

select is_empty(
  $$ select id from library_versions where asset_id::text like '00000000-0000-4000-e570-%' $$,
  'a stranger reads no version history, not even of the public asset');

-- ── Seat 5: platform staff ───────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a570-000000000005', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select id from library_assets where space_id = '00000000-0000-4000-c570-00000000000b' order by id $$,
  $$ values ('00000000-0000-4000-e570-000000000003'::uuid),
            ('00000000-0000-4000-e570-000000000004'::uuid) $$,
  'platform staff read B''s Loom, the private row included');

select results_eq(
  $$ select id from library_versions where asset_id = '00000000-0000-4000-e570-000000000003' $$,
  $$ values ('00000000-0000-4000-d570-000000000002'::uuid) $$,
  'platform staff read B''s version history');

-- ── anon: off every table ────────────────────────────────────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

select throws_ok($$ select id from library_assets $$, '42501', null,
  'anon has no grant on library_assets');
select throws_ok($$ select id from library_collections $$, '42501', null,
  'anon has no grant on library_collections');
select throws_ok($$ select asset_id from library_collection_items $$, '42501', null,
  'anon has no grant on library_collection_items');
select throws_ok($$ select id from library_versions $$, '42501', null,
  'anon has no grant on library_versions');

-- ── The catalog ──────────────────────────────────────────────────────────────────────────────────
reset role;

select is_empty(
  $$ select policyname from pg_policies
     where schemaname = 'public' and tablename = 'library_versions'
       and cmd in ('UPDATE', 'DELETE', 'ALL') $$,
  'no UPDATE or DELETE policy exists on library_versions: a version is a record');

select ok(
  not has_table_privilege('authenticated', 'public.library_versions', 'UPDATE'),
  'authenticated holds no UPDATE privilege on library_versions');

select ok(
  not has_table_privilege('authenticated', 'public.library_versions', 'DELETE'),
  'authenticated holds no DELETE privilege on library_versions');

select is_empty(
  $$ select policyname from pg_policies
     where schemaname = 'public' and tablename = 'library_styles' $$,
  'library_styles keeps no policy: Recraft style ids stay service-role only');

select ok(
  not has_table_privilege('authenticated', 'public.library_styles', 'SELECT'),
  'authenticated holds no SELECT privilege on library_styles');

select * from finish();
rollback;
