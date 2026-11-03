-- ADR-1938 / LIVE-2076 proof (20270346028800_space_community_wall.sql).
--
-- A Space's Community wall is a set of posts whose scope is the Space (posts.scope_space_id, derived
-- from scope_id by sync_post_scope_arc). This file proves, from both directions:
--   READ   default (anyone): anon and an outsider read a wall post; members-only: they do not, a Space
--          member, the staff and the owner still do; a private Space is never read by an outsider.
--   WRITE  a paid Space member posts; an outsider and (by default) a follower do not; a follower does
--          once the owner lets followers interact; nobody can stamp a Space id on a PUBLIC post to dodge
--          the wall rules.
--   MODERATE the moderator rung removes another person's wall post; the viewer rung does not.
--   CATALOG the three helpers are SECURITY DEFINER in `private` only; posts still has exactly one
--          permissive SELECT policy; space_wall_settings is not writable by anon or authenticated.
--
-- One transaction, rolled back. Fixture style follows feed_rls_space_scope.test.sql.

begin;
select plan(24);

insert into auth.users (id, email) values
  ('00000000-0000-4000-a400-000000000001', 'w-owner@test.local'),
  ('00000000-0000-4000-a400-000000000002', 'w-mod@test.local'),
  ('00000000-0000-4000-a400-000000000003', 'w-viewer@test.local'),
  ('00000000-0000-4000-a400-000000000004', 'w-member@test.local'),
  ('00000000-0000-4000-a400-000000000005', 'w-follower@test.local'),
  ('00000000-0000-4000-a400-000000000006', 'w-outsider@test.local');

insert into public.profiles (id, auth_user_id, display_name, handle, community_role) values
  ('00000000-0000-4000-b400-000000000001', '00000000-0000-4000-a400-000000000001', 'W Owner', 'w-owner', 'member'),
  ('00000000-0000-4000-b400-000000000002', '00000000-0000-4000-a400-000000000002', 'W Mod', 'w-mod', 'member'),
  ('00000000-0000-4000-b400-000000000003', '00000000-0000-4000-a400-000000000003', 'W Viewer', 'w-viewer', 'member'),
  ('00000000-0000-4000-b400-000000000004', '00000000-0000-4000-a400-000000000004', 'W Member', 'w-member', 'member'),
  ('00000000-0000-4000-b400-000000000005', '00000000-0000-4000-a400-000000000005', 'W Follower', 'w-follower', 'member'),
  ('00000000-0000-4000-b400-000000000006', '00000000-0000-4000-a400-000000000006', 'W Outsider', 'w-outsider', 'member');

-- trg_on_auth_user_created auto-provisions a profile per auth user: keep only the fixed ids.
delete from public.profiles
where auth_user_id in (
    '00000000-0000-4000-a400-000000000001', '00000000-0000-4000-a400-000000000002',
    '00000000-0000-4000-a400-000000000003', '00000000-0000-4000-a400-000000000004',
    '00000000-0000-4000-a400-000000000005', '00000000-0000-4000-a400-000000000006')
  and id not in (
    '00000000-0000-4000-b400-000000000001', '00000000-0000-4000-b400-000000000002',
    '00000000-0000-4000-b400-000000000003', '00000000-0000-4000-b400-000000000004',
    '00000000-0000-4000-b400-000000000005', '00000000-0000-4000-b400-000000000006');

insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');

insert into public.spaces (id, slug, name, type, entity_id, status, visibility)
select '00000000-0000-4000-c400-0000000000cc'::uuid, 'w-root', 'W Root', 'root',
       (select id from public.entities where key = 'labs' limit 1), 'active', 'network'
where not exists (select 1 from public.spaces where type = 'root');

-- SA: a public Space. SB: a private Space (the wall of a private Space is never anyone's to read).
insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility) values
  ('00000000-0000-4000-c400-00000000000a', 'w-space', 'W Space', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b400-000000000001', 'active', 'network'),
  ('00000000-0000-4000-c400-00000000000b', 'w-private', 'W Private', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b400-000000000001', 'active', 'private');

insert into public.space_members (space_id, profile_id, role, status) values
  ('00000000-0000-4000-c400-00000000000a', '00000000-0000-4000-b400-000000000002', 'moderator', 'active'),
  ('00000000-0000-4000-c400-00000000000a', '00000000-0000-4000-b400-000000000003', 'viewer', 'active');
insert into public.space_membership_tiers (id, space_id, name, price_cents) values
  ('00000000-0000-4000-f400-000000000001', '00000000-0000-4000-c400-00000000000a', 'Wall Tier', 0);
insert into public.space_memberships (space_id, member_profile_id, tier_id, status) values
  ('00000000-0000-4000-c400-00000000000a', '00000000-0000-4000-b400-000000000004',
   '00000000-0000-4000-f400-000000000001', 'active');
insert into public.space_follows (space_id, follower_profile_id) values
  ('00000000-0000-4000-c400-00000000000a', '00000000-0000-4000-b400-000000000005');

-- W1: a wall post on SA by the owner. W2: a wall post by the member. W3: a wall post on the private Space.
insert into public.posts (id, author_id, body, scope_id, scope_space_id, visibility, post_type, parent_id) values
  ('00000000-0000-4000-f400-000000000001', '00000000-0000-4000-b400-000000000001', 'W owner post', '00000000-0000-4000-c400-00000000000a', '00000000-0000-4000-c400-00000000000a', 'cluster', 'feed', null),
  ('00000000-0000-4000-f400-000000000002', '00000000-0000-4000-b400-000000000004', 'W member post', '00000000-0000-4000-c400-00000000000a', '00000000-0000-4000-c400-00000000000a', 'cluster', 'feed', null),
  ('00000000-0000-4000-f400-000000000003', '00000000-0000-4000-b400-000000000001', 'W private post', '00000000-0000-4000-c400-00000000000b', '00000000-0000-4000-c400-00000000000b', 'cluster', 'feed', null);

grant select, insert, update, delete on public.posts to anon, authenticated;
grant select on public.spaces, public.profiles, public.circles, public.memberships, public.space_members,
  public.space_memberships, public.space_follows, public.space_wall_settings to anon, authenticated;

-- ── The catalog ───────────────────────────────────────────────────────────────────────────────────
select is(
  (select scope_space_id from public.posts where id = '00000000-0000-4000-f400-000000000001'),
  '00000000-0000-4000-c400-00000000000a'::uuid,
  'a wall post carries its Space in scope_space_id');

select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.prosecdef
      and p.proname in ('can_read_space_wall', 'can_post_space_wall', 'can_moderate_space_wall')),
  3::bigint, 'the three wall helpers are SECURITY DEFINER in private');

select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('can_read_space_wall', 'can_post_space_wall', 'can_moderate_space_wall')),
  0::bigint, 'and none has a public twin on the REST surface');

select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'posts' and cmd = 'SELECT' and permissive = 'PERMISSIVE'),
  1::bigint, 'posts still has exactly one permissive SELECT policy');

select ok(not has_table_privilege('authenticated', 'public.space_wall_settings', 'insert')
  and not has_table_privilege('anon', 'public.space_wall_settings', 'update'),
  'space_wall_settings is not writable by anon or authenticated');

-- ── READ: default is anyone ───────────────────────────────────────────────────────────────────────
set local role anon;
select results_eq($$ select count(*)::int from posts where id = '00000000-0000-4000-f400-000000000001' $$, $$ values (1) $$,
  'default: anon reads a wall post');
select is_empty($$ select id from posts where id = '00000000-0000-4000-f400-000000000003' $$,
  'a private Space wall is not read by anon');
select results_eq($$ select count(*)::int from public.space_wall_feed('00000000-0000-4000-c400-00000000000a') $$, $$ values (2) $$,
  'space_wall_feed: anon gets the public wall newest first');
select is_empty($$ select id from public.space_wall_feed('00000000-0000-4000-c400-00000000000b') $$,
  'space_wall_feed: a private Space wall returns no rows to anon');

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a400-000000000006', 'role', 'authenticated')::text, true);
set local role authenticated;
select results_eq($$ select count(*)::int from posts where id = '00000000-0000-4000-f400-000000000001' $$, $$ values (1) $$,
  'default: an outsider reads a wall post');
select is_empty($$ select id from posts where id = '00000000-0000-4000-f400-000000000003' $$,
  'an outsider does not read a private Space wall');

-- members-only: switch as postgres, then re-check each seat.
reset role;
insert into public.space_wall_settings (space_id, read_access) values ('00000000-0000-4000-c400-00000000000a', 'members');

set local role anon;
select is_empty($$ select id from posts where id = '00000000-0000-4000-f400-000000000001' $$,
  'members-only: anon reads nothing');
select is_empty($$ select id from public.space_wall_feed('00000000-0000-4000-c400-00000000000a') $$,
  'space_wall_feed: members-only wall returns no rows to anon');
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a400-000000000006', 'role', 'authenticated')::text, true);
set local role authenticated;
select is_empty($$ select id from posts where id = '00000000-0000-4000-f400-000000000001' $$,
  'members-only: an outsider reads nothing');
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a400-000000000004', 'role', 'authenticated')::text, true);
select results_eq($$ select count(*)::int from posts where scope_space_id = '00000000-0000-4000-c400-00000000000a' $$, $$ values (2) $$,
  'members-only: a Space member reads the wall');
select results_eq($$ select count(*)::int from public.space_wall_feed('00000000-0000-4000-c400-00000000000a') $$, $$ values (2) $$,
  'space_wall_feed: members-only wall returns its posts to a Space member');

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a400-000000000003', 'role', 'authenticated')::text, true);
select results_eq($$ select count(*)::int from posts where scope_space_id = '00000000-0000-4000-c400-00000000000a' $$, $$ values (2) $$,
  'members-only: a staff seat (viewer rung) still reads the wall');

-- ── WRITE ─────────────────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a400-000000000006', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ insert into posts (author_id, body, scope_id, scope_space_id, visibility, post_type)
     values ('00000000-0000-4000-b400-000000000006', 'outsider', '00000000-0000-4000-c400-00000000000a', '00000000-0000-4000-c400-00000000000a', 'cluster', 'feed') $$,
  '42501', null, 'an outsider cannot post on the wall');

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a400-000000000004', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ insert into posts (author_id, body, scope_id, scope_space_id, visibility, post_type)
     values ('00000000-0000-4000-b400-000000000004', 'member', '00000000-0000-4000-c400-00000000000a', '00000000-0000-4000-c400-00000000000a', 'cluster', 'feed') $$,
  'a paid Space member posts on the wall');
select throws_ok(
  $$ insert into posts (author_id, body, scope_id, scope_space_id, visibility, post_type)
     values ('00000000-0000-4000-b400-000000000004', 'sneaky', '00000000-0000-4000-c400-00000000000a', '00000000-0000-4000-c400-00000000000a', 'public', 'feed') $$,
  '42501', null, 'a public post cannot name a Space as its scope to dodge the wall rules');

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a400-000000000005', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ insert into posts (author_id, body, scope_id, scope_space_id, visibility, post_type)
     values ('00000000-0000-4000-b400-000000000005', 'follower', '00000000-0000-4000-c400-00000000000a', '00000000-0000-4000-c400-00000000000a', 'cluster', 'feed') $$,
  '42501', null, 'by default a follower cannot post on the wall');

reset role;
update public.space_wall_settings set followers_interact = true where space_id = '00000000-0000-4000-c400-00000000000a';
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a400-000000000005', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ insert into posts (author_id, body, scope_id, scope_space_id, visibility, post_type)
     values ('00000000-0000-4000-b400-000000000005', 'follower ok', '00000000-0000-4000-c400-00000000000a', '00000000-0000-4000-c400-00000000000a', 'cluster', 'feed') $$,
  'once the owner lets followers interact, a follower posts');

-- ── MODERATE ──────────────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a400-000000000003', 'role', 'authenticated')::text, true);
select results_eq(
  $$ with d as (delete from posts where id = '00000000-0000-4000-f400-000000000002' returning 1) select count(*)::int from d $$,
  $$ values (0) $$, 'the viewer rung cannot remove another person''s wall post');

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a400-000000000002', 'role', 'authenticated')::text, true);
select results_eq(
  $$ with d as (delete from posts where id = '00000000-0000-4000-f400-000000000002' returning 1) select count(*)::int from d $$,
  $$ values (1) $$, 'the moderator rung removes it');

select * from finish();
rollback;
