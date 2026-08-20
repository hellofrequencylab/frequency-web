-- C3.5 narrowing proof (20270317000000_narrow_space_update_rls_arms.sql · ADR-1091 · LIVE-059).
--
-- The Space Communities wall carried the widest read grant in the app: an is_space_update_post OR
-- arm inside 5 permissive policies on posts / post_reactions that let EVERY signed-in profile,
-- platform-wide, read any post in a space_update thread (any visibility, no Space term), reply
-- under one, and read / add reactions on one. The wall is deleted (C3.4) and the feature was never
-- used once (0 rows, measured twice, ADR-1091), so the arms served nothing. This file proves the
-- narrowing landed from both directions:
--
--   DENIED NOW (the arm used to allow each of these):
--     * a signed-in profile with NO community_role reads no space_update-shaped post, no reaction,
--       and cannot reply or react - the platform-wide carve-out is gone at its widest point;
--     * a plain member no longer reads an out-of-circle group reply merely because it hangs under
--       a space_update anchor - the arm's visibility bypass is gone.
--   STILL WORKING (nothing the narrowing must not touch moved):
--     * the brand Update ANCHOR (public, top-level) stays readable to anon and to members through
--       the surviving public arms - the SpaceUpdates block loses nothing;
--     * Circle group posts, crew+ reaction read / insert-own, and delete-own-reaction (whose
--       dropped arm was strictly narrower than its surviving arm) are all unaffected.
--   AND IN THE CATALOG (a behavioral pass can be an accident; the catalog cannot):
--     * 0 policies reference is_space_update_post, the helper is gone from private AND public,
--       and the 20261004000000 consolidation invariant survives: exactly ONE permissive policy
--       per (table, command) on both tables.
--
-- One transaction, rolled back: nothing persists. Fixture style follows
-- space_tenancy_walls.test.sql / circle_privacy.test.sql, including the auto-provisioned-profile
-- cleanup and the fixture-table grants (a fresh local stack lacks the hosted platform's default
-- grants; the POLICIES are what this file tests, not the grant baseline).

begin;
select plan(22);

-- ── Fixture (seeded as postgres, which RLS does not bind) ────────────────────────────────────────

insert into auth.users (id, email) values
  ('00000000-0000-4000-a200-000000000001', 'c35-author@test.local'),
  ('00000000-0000-4000-a200-000000000002', 'c35-roleless@test.local'),
  ('00000000-0000-4000-a200-000000000003', 'c35-member@test.local');

-- P2 is THE seat this migration exists for: signed in, but community_role NULL, so the crew+
-- arms never admit it. Before C3.5 the is_space_update_post arms admitted it to everything
-- space_update-shaped, platform-wide.
insert into public.profiles (id, auth_user_id, display_name, handle, community_role) values
  ('00000000-0000-4000-b200-000000000001', '00000000-0000-4000-a200-000000000001', 'C35 Author', 'c35-author', 'member'),
  ('00000000-0000-4000-b200-000000000002', '00000000-0000-4000-a200-000000000002', 'C35 Roleless', 'c35-roleless', null),
  ('00000000-0000-4000-b200-000000000003', '00000000-0000-4000-a200-000000000003', 'C35 Member', 'c35-member', 'member');

-- trg_on_auth_user_created auto-provisions a profile per auth.users row, so each seeded user has
-- TWO profiles and get_my_profile_id()'s scalar subquery would error. Keep only the fixed ids.
delete from public.profiles
where auth_user_id in (
    '00000000-0000-4000-a200-000000000001',
    '00000000-0000-4000-a200-000000000002',
    '00000000-0000-4000-a200-000000000003')
  and id not in (
    '00000000-0000-4000-b200-000000000001',
    '00000000-0000-4000-b200-000000000002',
    '00000000-0000-4000-b200-000000000003');

insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');

-- A root space so circle-side triggers (default_space_id_to_root) always have their sentinel.
insert into public.spaces (id, slug, name, type, entity_id, status, visibility)
select '00000000-0000-4000-c200-0000000000cc'::uuid, 'c35-root', 'C35 Root', 'root',
       (select id from public.entities where key = 'labs' limit 1), 'active', 'network'
where not exists (select 1 from public.spaces where type = 'root');

-- The business Space whose brand Update the anchor belongs to.
insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility) values
  ('00000000-0000-4000-c200-00000000000a', 'c35-space', 'C35 Space', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b200-000000000001', 'active', 'network');

-- C1: the circle P3 belongs to (the unaffected-Circle control). C2: a circle NO fixture seat
-- belongs to - the foreign scope that proves the arm's visibility bypass is gone.
insert into public.circles (id, name, slug, type, status, space_id, host_id, unlisted, access) values
  ('00000000-0000-4000-e200-000000000001', 'C35 Circle Mine', 'c35-circle-mine', 'online', 'active',
   '00000000-0000-4000-c200-00000000000a', '00000000-0000-4000-b200-000000000001', false, 'open'),
  ('00000000-0000-4000-e200-000000000002', 'C35 Circle Foreign', 'c35-circle-foreign', 'online', 'active',
   '00000000-0000-4000-c200-00000000000a', '00000000-0000-4000-b200-000000000001', false, 'open');

insert into public.memberships (profile_id, circle_id, status) values
  ('00000000-0000-4000-b200-000000000003', '00000000-0000-4000-e200-000000000001', 'active');

-- The posts. A1 is EXACTLY the shape ensureUpdateAnchor still writes (post_type space_update,
-- scope_id the Space, visibility public, top-level). R1 is the worst case the dropped arm covered:
-- a GROUP-visibility reply scoped to a circle none of the reading seats belong to, readable before
-- C3.5 by every signed-in profile purely because its thread roots at a space_update anchor.
insert into public.posts (id, author_id, body, scope_id, visibility, post_type, parent_id) values
  ('00000000-0000-4000-f200-000000000001', '00000000-0000-4000-b200-000000000001', 'C35 brand update anchor',
   '00000000-0000-4000-c200-00000000000a', 'public', 'space_update', null),
  ('00000000-0000-4000-f200-000000000002', '00000000-0000-4000-b200-000000000001', 'C35 group reply under the anchor',
   '00000000-0000-4000-e200-000000000002', 'group', 'feed', '00000000-0000-4000-f200-000000000001'),
  ('00000000-0000-4000-f200-000000000003', '00000000-0000-4000-b200-000000000001', 'C35 plain public feed post',
   null, 'public', 'feed', null),
  ('00000000-0000-4000-f200-000000000004', '00000000-0000-4000-b200-000000000001', 'C35 group post in my circle',
   '00000000-0000-4000-e200-000000000001', 'group', 'feed', null);

-- X1: the author's reaction on the anchor (the crew+ read control). X2: the roleless profile's own
-- reaction, seeded so the delete-own arm can be exercised by a seat the SELECT policy now excludes.
insert into public.post_reactions (id, post_id, profile_id, reaction_type) values
  ('00000000-0000-4000-f200-000000000011', '00000000-0000-4000-f200-000000000001',
   '00000000-0000-4000-b200-000000000001', '❤️'),
  ('00000000-0000-4000-f200-000000000012', '00000000-0000-4000-f200-000000000001',
   '00000000-0000-4000-b200-000000000002', '❤️');

-- Fresh-stack grants (see header). Policy subqueries and the invoker-security engagement triggers
-- read profiles / circles and update posts as the querying role.
grant select, insert, update, delete on public.posts, public.post_reactions to anon, authenticated;
grant select on public.profiles, public.circles, public.memberships, public.spaces to anon, authenticated;

-- ── The catalog: the arms are gone, the helper is gone, the consolidation invariant holds ────────

select is(
  (select count(*) from pg_policies
    where qual ilike '%is_space_update_post%' or with_check ilike '%is_space_update_post%'),
  0::bigint,
  'no policy anywhere references is_space_update_post');

select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'is_space_update_post'),
  0::bigint,
  'the helper is dropped from private');

select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_space_update_post'),
  0::bigint,
  'and was never resurrected in public');

create or replace function _c35_perm_count(_table text, _cmd text) returns bigint language sql as $$
  select count(*) from pg_policies
   where schemaname = 'public' and tablename = _table and cmd = _cmd and permissive = 'PERMISSIVE';
$$;

select is(_c35_perm_count('posts', 'SELECT'), 1::bigint, 'posts: still exactly one permissive SELECT policy');
select is(_c35_perm_count('posts', 'INSERT'), 1::bigint, 'posts: still exactly one permissive INSERT policy');
select is(_c35_perm_count('post_reactions', 'SELECT'), 1::bigint, 'post_reactions: still exactly one permissive SELECT policy');
select is(_c35_perm_count('post_reactions', 'INSERT'), 1::bigint, 'post_reactions: still exactly one permissive INSERT policy');
select is(_c35_perm_count('post_reactions', 'DELETE'), 1::bigint, 'post_reactions: still exactly one permissive DELETE policy');

-- ── Seat 1: signed in, community_role NULL - the seat the carve-out used to admit ────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a200-000000000002', 'role', 'authenticated')::text, true);

select is_empty(
  $$ select id from posts where id in
     ('00000000-0000-4000-f200-000000000001', '00000000-0000-4000-f200-000000000002') $$,
  'a roleless signed-in profile reads NO space_update-shaped post - the platform-wide grant is gone');

select is_empty(
  $$ select post_id from post_reactions $$,
  'and reads no reactions on one (the reaction-read carve-out is gone)');

select throws_ok(
  $$ insert into posts (author_id, body, parent_id, visibility)
     values ('00000000-0000-4000-b200-000000000002', 'C35 intruding reply',
             '00000000-0000-4000-f200-000000000001', 'public') $$,
  '42501', null,
  'and can no longer reply under a space_update anchor');

select throws_ok(
  $$ insert into post_reactions (post_id, profile_id, reaction_type)
     values ('00000000-0000-4000-f200-000000000001', '00000000-0000-4000-b200-000000000002', 'zap') $$,
  '42501', null,
  'and can no longer react on one');

select lives_ok(
  $$ delete from post_reactions where id = '00000000-0000-4000-f200-000000000012' $$,
  'deleting their OWN reaction still works - the surviving delete-own arm carries every caller the dropped arm did');

reset role;
select is_empty(
  $$ select id from public.post_reactions where id = '00000000-0000-4000-f200-000000000012' $$,
  'and the row is really gone (the delete was not a zero-row no-op)');

-- ── Seat 2: a plain member of circle C1 - the surviving reads ────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a200-000000000003', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select count(*)::int from posts where id = '00000000-0000-4000-f200-000000000001' $$,
  $$ values (1) $$,
  'a member still reads the brand Update anchor through the crew+ public-visibility arm');

select is_empty(
  $$ select id from posts where id = '00000000-0000-4000-f200-000000000002' $$,
  'but no longer reads a foreign-circle GROUP reply just because it hangs under an anchor');

select results_eq(
  $$ select count(*)::int from posts where id = '00000000-0000-4000-f200-000000000004' $$,
  $$ values (1) $$,
  'their own Circle''s group post is unaffected');

select lives_ok(
  $$ insert into posts (author_id, body, scope_id, visibility)
     values ('00000000-0000-4000-b200-000000000003', 'C35 circle post lives',
             '00000000-0000-4000-e200-000000000001', 'group') $$,
  'posting into their own Circle is unaffected');

select lives_ok(
  $$ insert into post_reactions (post_id, profile_id, reaction_type)
     values ('00000000-0000-4000-f200-000000000003', '00000000-0000-4000-b200-000000000003', '❤️') $$,
  'reacting on a readable feed post is unaffected');

select results_eq(
  $$ select count(*)::int from post_reactions where post_id = '00000000-0000-4000-f200-000000000001' $$,
  $$ values (1) $$,
  'and the crew+ reaction read still serves the anchor''s remaining reaction');

-- ── Seat 3: anon - the public surface the SpaceUpdates block relies on ───────────────────────────
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

select results_eq(
  $$ select count(*)::int from posts where id = '00000000-0000-4000-f200-000000000001' $$,
  $$ values (1) $$,
  'anon still reads the public top-level anchor (the brand Update surface lost nothing)');

select is_empty(
  $$ select post_id from post_reactions $$,
  'anon reads no reactions, exactly as before');

select * from finish();
rollback;
