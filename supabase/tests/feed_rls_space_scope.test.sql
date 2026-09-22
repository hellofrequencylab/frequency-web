-- LIVE-335 proof (20270345007700_feed_rls_space_scope.sql · ADR-1514).
--
-- Three read policies could not say what the feed stack needs, so six files read on the service
-- role. This file proves each policy now says it, from both directions:
--
--   ADMITTED NOW (each was refused before):
--     * a Space STAFF seat that joined none of the Space's Circles reads a `cluster` post in a
--       Circle the Space owns (posts, via private.is_member_of_circle_space);
--     * an ordinary Circle member at community_role `member` reads a `circle_only` event in that
--       Circle (events; crew is a retired rung), and private.can_read_event agrees;
--     * a Space's OWNER reads their own ARCHIVED private Space (spaces; the owner arm no longer
--       sits behind status = 'active').
--   STILL REFUSED (the widening stops exactly where it should):
--     * the staff seat reads no `group` post in that Circle (belonging to a Space is not
--       belonging to its Circles), and no `circle_only` event there;
--     * nobody reads a `cluster` post in a Circle owned by a Space they do not belong to;
--     * an outsider and anon read none of the private Spaces, and anon reads no cluster post.
--   AND IN THE CATALOG (a behavioral pass can be an accident; the catalog cannot):
--     * the helper is SECURITY DEFINER in `private` only, executable by anon and authenticated
--       (the posts policy is evaluated as the querying role, and anon reads posts);
--     * 20261004000000's invariant survives: exactly ONE permissive SELECT policy on each table.
--
-- One transaction, rolled back: nothing persists. Fixture style follows
-- space_update_rls_narrowing.test.sql / circle_privacy.test.sql, including the auto-provisioned
-- profile cleanup and the fixture-table grants (a fresh local stack lacks the hosted platform's
-- default grants; the POLICIES are what this file tests, not the grant baseline).

begin;
select plan(34);

-- ── Fixture (seeded as postgres, which RLS does not bind) ────────────────────────────────────────

insert into auth.users (id, email) values
  ('00000000-0000-4000-a300-000000000001', 'l335-owner@test.local'),
  ('00000000-0000-4000-a300-000000000002', 'l335-staff@test.local'),
  ('00000000-0000-4000-a300-000000000003', 'l335-circle-member@test.local'),
  ('00000000-0000-4000-a300-000000000004', 'l335-outsider@test.local');

-- Every seat is a plain `member`: the point is what standing in a Space or a Circle grants, not
-- what a community rung grants.
insert into public.profiles (id, auth_user_id, display_name, handle, community_role) values
  ('00000000-0000-4000-b300-000000000001', '00000000-0000-4000-a300-000000000001', 'L335 Owner', 'l335-owner', 'member'),
  ('00000000-0000-4000-b300-000000000002', '00000000-0000-4000-a300-000000000002', 'L335 Staff', 'l335-staff', 'member'),
  ('00000000-0000-4000-b300-000000000003', '00000000-0000-4000-a300-000000000003', 'L335 Circle Member', 'l335-circle-member', 'member'),
  ('00000000-0000-4000-b300-000000000004', '00000000-0000-4000-a300-000000000004', 'L335 Outsider', 'l335-outsider', 'member');

-- trg_on_auth_user_created auto-provisions a profile per auth.users row, so each seeded user has
-- TWO profiles and get_my_profile_id()'s scalar subquery would error. Keep only the fixed ids.
delete from public.profiles
where auth_user_id in (
    '00000000-0000-4000-a300-000000000001', '00000000-0000-4000-a300-000000000002',
    '00000000-0000-4000-a300-000000000003', '00000000-0000-4000-a300-000000000004')
  and id not in (
    '00000000-0000-4000-b300-000000000001', '00000000-0000-4000-b300-000000000002',
    '00000000-0000-4000-b300-000000000003', '00000000-0000-4000-b300-000000000004');

insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');

-- A root space so default_space_id_to_root always has its sentinel.
insert into public.spaces (id, slug, name, type, entity_id, status, visibility)
select '00000000-0000-4000-c300-0000000000cc'::uuid, 'l335-root', 'L335 Root', 'root',
       (select id from public.entities where key = 'labs' limit 1), 'active', 'network'
where not exists (select 1 from public.spaces where type = 'root');

-- SA: the Space under test, owned by the owner seat. SB: the owner's ARCHIVED private Space (the
-- row the old policy hid from its own owner). SC: the owner's ACTIVE private Space (the control:
-- readable through private.is_space_member before and after). SD: a Space nobody in this fixture
-- belongs to (owner_profile_id null), so a cluster post in ITS Circle is the foreign control.
insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility) values
  ('00000000-0000-4000-c300-00000000000a', 'l335-space', 'L335 Space', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b300-000000000001', 'active', 'network'),
  ('00000000-0000-4000-c300-00000000000b', 'l335-archived-private', 'L335 Archived Private', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b300-000000000001', 'archived', 'private'),
  ('00000000-0000-4000-c300-00000000000c', 'l335-active-private', 'L335 Active Private', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b300-000000000001', 'active', 'private'),
  ('00000000-0000-4000-c300-00000000000d', 'l335-foreign-space', 'L335 Foreign Space', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   null, 'active', 'network');

-- The staff seat: the lowest staff rung on SA, and NOT a member of any Circle. This is THE seat
-- LIVE-335 exists for.
insert into public.space_members (space_id, profile_id, role, status) values
  ('00000000-0000-4000-c300-00000000000a', '00000000-0000-4000-b300-000000000002', 'viewer', 'active');

-- X: the Circle SA owns. Y: the Circle the foreign Space owns.
insert into public.circles (id, name, slug, type, status, space_id, host_id, unlisted, access) values
  ('00000000-0000-4000-e300-000000000001', 'L335 Circle', 'l335-circle', 'online', 'active',
   '00000000-0000-4000-c300-00000000000a', '00000000-0000-4000-b300-000000000001', false, 'open'),
  ('00000000-0000-4000-e300-000000000002', 'L335 Foreign Circle', 'l335-foreign-circle', 'online', 'active',
   '00000000-0000-4000-c300-00000000000d', '00000000-0000-4000-b300-000000000001', false, 'open');

-- The Circle member: in X, in no Space.
insert into public.memberships (profile_id, circle_id, status) values
  ('00000000-0000-4000-b300-000000000003', '00000000-0000-4000-e300-000000000001', 'active');

-- P1: the announcement (cluster, in X). P2: a members-only post (group, in X). P3: an
-- announcement in the foreign Space's Circle (cluster, in Y).
insert into public.posts (id, author_id, body, scope_id, visibility, post_type, parent_id) values
  ('00000000-0000-4000-f300-000000000001', '00000000-0000-4000-b300-000000000001', 'L335 cluster announcement in X',
   '00000000-0000-4000-e300-000000000001', 'cluster', 'feed', null),
  ('00000000-0000-4000-f300-000000000002', '00000000-0000-4000-b300-000000000001', 'L335 group post in X',
   '00000000-0000-4000-e300-000000000001', 'group', 'feed', null),
  ('00000000-0000-4000-f300-000000000003', '00000000-0000-4000-b300-000000000001', 'L335 cluster announcement in Y',
   '00000000-0000-4000-e300-000000000002', 'cluster', 'feed', null);

-- E1: a published circle_only gathering in X. No host_id / posted_by, so only the circle_only
-- branch can admit a reader.
insert into public.events (id, title, slug, scope_type, scope_id, visibility, status, starts_at, ends_at, join_mode, is_cancelled)
values
  ('00000000-0000-4000-d300-000000000001', 'L335 gathering', 'l335-gathering', 'circle',
   '00000000-0000-4000-e300-000000000001', 'circle_only', 'published',
   now() + interval '7 days', now() + interval '7 days 2 hours', 'rsvp', false);

-- Fresh-stack grants (see header). Policy subqueries read circles / profiles / memberships as
-- the querying role.
grant select on public.posts, public.events, public.spaces, public.profiles, public.circles,
  public.memberships, public.space_members to anon, authenticated;

-- ── The catalog ──────────────────────────────────────────────────────────────────────────────────

select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'is_member_of_circle_space' and p.prosecdef),
  1::bigint,
  'private.is_member_of_circle_space exists and is SECURITY DEFINER');

select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_member_of_circle_space'),
  0::bigint,
  'and it is not on the REST surface (no public twin)');

select ok(has_function_privilege('anon', 'private.is_member_of_circle_space(uuid)', 'execute'),
  'anon can execute it (the posts policy runs as the querying role, and anon reads posts)');
select ok(has_function_privilege('authenticated', 'private.is_member_of_circle_space(uuid)', 'execute'),
  'authenticated can execute it');

create or replace function _l335_perm_count(_table text, _cmd text) returns bigint language sql as $$
  select count(*) from pg_policies
   where schemaname = 'public' and tablename = _table and cmd = _cmd and permissive = 'PERMISSIVE';
$$;

select is(_l335_perm_count('posts', 'SELECT'), 1::bigint, 'posts: still exactly one permissive SELECT policy');
select is(_l335_perm_count('events', 'SELECT'), 1::bigint, 'events: still exactly one permissive SELECT policy');
select is(_l335_perm_count('spaces', 'SELECT'), 1::bigint, 'spaces: still exactly one permissive SELECT policy');

select ok(
  (select qual ilike '%is_member_of_circle_space%' from pg_policies
    where schemaname = 'public' and tablename = 'posts'
      and policyname = 'posts: read by visibility (crew+ or public)'),
  'the posts read policy routes the Space lookup through the helper, not an inline join');

select ok(
  (select qual ilike '%''member''::community_role%' and qual ilike '%''crew''::community_role%' from pg_policies
    where schemaname = 'public' and tablename = 'events'
      and policyname = 'events: status + visibility-aware read'),
  'the events read policy carries the member floor for Circles and keeps crew for the region');

select ok(
  (select qual ilike '%owner_profile_id%' from pg_policies
    where schemaname = 'public' and tablename = 'spaces' and policyname = 'spaces_read_active'),
  'spaces_read_active names the owner column outright');

-- ── Seat 1: Space staff who joined no Circle. THE seat this migration exists for. ────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a300-000000000002', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select count(*)::int from posts where id = '00000000-0000-4000-f300-000000000001' $$,
  $$ values (1) $$,
  'Space staff read a cluster announcement in a Circle their Space owns (ADMITTED NOW)');

select is_empty(
  $$ select id from posts where id = '00000000-0000-4000-f300-000000000002' $$,
  'but not a group post there: belonging to a Space is not belonging to its Circles');

select is_empty(
  $$ select id from posts where id = '00000000-0000-4000-f300-000000000003' $$,
  'and not a cluster announcement in a Circle a foreign Space owns');

select is_empty(
  $$ select id from events where id = '00000000-0000-4000-d300-000000000001' $$,
  'and no circle_only event there: events widened to Circle members, not to Space staff');

select ok(not private.can_read_event('00000000-0000-4000-d300-000000000001'),
  'private.can_read_event agrees for the staff seat');

select results_eq(
  $$ select count(*)::int from spaces where id = '00000000-0000-4000-c300-00000000000a' $$,
  $$ values (1) $$,
  'staff read the active non-private Space they serve');

select is_empty(
  $$ select id from spaces where id in
     ('00000000-0000-4000-c300-00000000000b', '00000000-0000-4000-c300-00000000000c') $$,
  'and none of the owner''s private Spaces (the owner arm is the owner''s alone)');

-- ── Seat 2: an ordinary Circle member, community_role member ────────────────────────────────────
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a300-000000000003', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select count(*)::int from events where id = '00000000-0000-4000-d300-000000000001' $$,
  $$ values (1) $$,
  'a plain member of the Circle reads its circle_only event (ADMITTED NOW; crew is retired)');

select ok(private.can_read_event('00000000-0000-4000-d300-000000000001'),
  'private.can_read_event agrees for the Circle member');

select results_eq(
  $$ select count(*)::int from posts where id in
     ('00000000-0000-4000-f300-000000000001', '00000000-0000-4000-f300-000000000002') $$,
  $$ values (2) $$,
  'the Circle member still reads the Circle''s cluster and group posts (unchanged branch)');

select is_empty(
  $$ select id from posts where id = '00000000-0000-4000-f300-000000000003' $$,
  'and not the foreign Circle''s announcement');

select is_empty(
  $$ select id from spaces where id in
     ('00000000-0000-4000-c300-00000000000b', '00000000-0000-4000-c300-00000000000c') $$,
  'a Circle member is not thereby a member of the owner''s private Spaces');

-- ── Seat 3: the owner ───────────────────────────────────────────────────────────────────────────
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a300-000000000001', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select count(*)::int from spaces where id = '00000000-0000-4000-c300-00000000000b' $$,
  $$ values (1) $$,
  'the owner reads their own ARCHIVED private Space (ADMITTED NOW: the owner arm ignores status)');

select results_eq(
  $$ select count(*)::int from spaces where id = '00000000-0000-4000-c300-00000000000c' $$,
  $$ values (1) $$,
  'and their own active private Space (unchanged: private.is_space_member already admitted the owner)');

select results_eq(
  $$ select count(*)::int from posts where id = '00000000-0000-4000-f300-000000000001' $$,
  $$ values (1) $$,
  'the owner reads the announcement in the Circle their Space owns (the owner is a Space member)');

-- ── Seat 4: an outsider at community_role member ────────────────────────────────────────────────
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a300-000000000004', 'role', 'authenticated')::text, true);

select is_empty(
  $$ select id from posts where id in
     ('00000000-0000-4000-f300-000000000001', '00000000-0000-4000-f300-000000000002',
      '00000000-0000-4000-f300-000000000003') $$,
  'an outsider reads none of the three posts');

select is_empty(
  $$ select id from events where id = '00000000-0000-4000-d300-000000000001' $$,
  'nor the circle_only event');

select ok(not private.can_read_event('00000000-0000-4000-d300-000000000001'),
  'private.can_read_event agrees for the outsider');

select is_empty(
  $$ select id from spaces where id in
     ('00000000-0000-4000-c300-00000000000b', '00000000-0000-4000-c300-00000000000c') $$,
  'nor either private Space');

select results_eq(
  $$ select count(*)::int from spaces where id = '00000000-0000-4000-c300-00000000000a' $$,
  $$ values (1) $$,
  'while the active non-private Space stays readable to everyone (unchanged arm)');

-- ── Seat 5: anon ────────────────────────────────────────────────────────────────────────────────
reset role;
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

select is_empty(
  $$ select id from posts where id in
     ('00000000-0000-4000-f300-000000000001', '00000000-0000-4000-f300-000000000003') $$,
  'anon reads no cluster announcement (the helper is false without a profile)');

select is_empty(
  $$ select id from spaces where id in
     ('00000000-0000-4000-c300-00000000000b', '00000000-0000-4000-c300-00000000000c') $$,
  'anon reads no private Space (the owner arm is null for anon)');

select results_eq(
  $$ select count(*)::int from spaces where id = '00000000-0000-4000-c300-00000000000a' $$,
  $$ values (1) $$,
  'anon still reads the active non-private Space');

select is_empty(
  $$ select id from events where id = '00000000-0000-4000-d300-000000000001' $$,
  'anon reads no circle_only event');

select * from finish();
rollback;
