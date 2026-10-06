-- A member tuned into a Circle's SECOND Channel reads its cluster posts
-- (20270346002000_cluster_reads_every_circle_channel.sql · LIVE-730 · ADR-1679).
--
-- Before: the posts policy and both feed RPCs matched a tuned member on circles.topical_channel_id
-- (the PRIMARY Channel) only, so a member tuned into the Circle's second Channel read nothing.
-- This file proves all three readers now match any of the Circle's Channels, and that a member
-- tuned into none of them still reads nothing:
--   ADMITTED NOW: tuned into Channel B only (the Circle's position-2 Channel), the member reads the
--                 cluster post through the posts policy, scoped_feed_for_viewer and feed_for_viewer;
--   STILL REFUSED: a member tuned into an unrelated Channel C reads it through none of the three,
--                  and nobody reads the Circle's group post by tuning alone.
--
-- One transaction, rolled back: nothing persists. Fixture style follows feed_rls_space_scope.test.sql.

begin;
select plan(9);

-- ── Fixture (seeded as postgres, which RLS does not bind) ────────────────────────────────────────

insert into auth.users (id, email) values
  ('00000000-0000-4000-a730-000000000001', 'l730-host@test.local'),
  ('00000000-0000-4000-a730-000000000002', 'l730-tuned@test.local'),
  ('00000000-0000-4000-a730-000000000003', 'l730-other@test.local');

insert into public.profiles (id, auth_user_id, display_name, handle, community_role) values
  ('00000000-0000-4000-b730-000000000001', '00000000-0000-4000-a730-000000000001', 'L730 Host', 'l730-host', 'member'),
  ('00000000-0000-4000-b730-000000000002', '00000000-0000-4000-a730-000000000002', 'L730 Tuned', 'l730-tuned', 'member'),
  ('00000000-0000-4000-b730-000000000003', '00000000-0000-4000-a730-000000000003', 'L730 Other', 'l730-other', 'member');

-- trg_on_auth_user_created auto-provisions a profile per auth.users row; keep only the fixed ids.
delete from public.profiles
where auth_user_id in (
    '00000000-0000-4000-a730-000000000001',
    '00000000-0000-4000-a730-000000000002',
    '00000000-0000-4000-a730-000000000003')
  and id not in (
    '00000000-0000-4000-b730-000000000001',
    '00000000-0000-4000-b730-000000000002',
    '00000000-0000-4000-b730-000000000003');

insert into public.topical_channels (id, name, slug, category) values
  ('00000000-0000-4000-d730-00000000000a', 'L730 A', 'l730-a', 'test'),
  ('00000000-0000-4000-d730-00000000000b', 'L730 B', 'l730-b', 'test'),
  ('00000000-0000-4000-d730-00000000000c', 'L730 C', 'l730-c', 'test');

-- A listed, open, hub-less Circle whose PRIMARY Channel is A and whose second Channel is B.
insert into public.circles (id, name, slug, type, status, host_id, unlisted, access, topical_channel_id) values
  ('00000000-0000-4000-e730-000000000001', 'L730 Circle', 'l730-circle', 'online', 'active',
   '00000000-0000-4000-b730-000000000001', false, 'open', '00000000-0000-4000-d730-00000000000a');

insert into public.circle_channels (circle_id, topical_channel_id, position) values
  ('00000000-0000-4000-e730-000000000001', '00000000-0000-4000-d730-00000000000a', 1),
  ('00000000-0000-4000-e730-000000000001', '00000000-0000-4000-d730-00000000000b', 2)
on conflict do nothing;

-- Tuned into B only (not the primary), and the control tuned into C only.
insert into public.topical_channel_memberships (topical_channel_id, profile_id) values
  ('00000000-0000-4000-d730-00000000000b', '00000000-0000-4000-b730-000000000002'),
  ('00000000-0000-4000-d730-00000000000c', '00000000-0000-4000-b730-000000000003');

insert into public.posts (id, author_id, body, scope_id, visibility, post_type, parent_id) values
  ('00000000-0000-4000-f730-000000000001', '00000000-0000-4000-b730-000000000001', 'L730 cluster post',
   '00000000-0000-4000-e730-000000000001', 'cluster', 'feed', null),
  ('00000000-0000-4000-f730-000000000002', '00000000-0000-4000-b730-000000000001', 'L730 group post',
   '00000000-0000-4000-e730-000000000001', 'group', 'feed', null);

-- feed_open (seeded true by 20260706000000) opens feed_for_viewer to every member and bypasses the
-- reach gate under test; close it for this transaction so the gate itself is what answers.
update public.platform_flags set value = false where key = 'feed_open';

-- Fresh-stack grants (a local stack lacks the hosted defaults; the POLICIES are under test).
grant select on public.posts, public.profiles, public.circles, public.circle_channels,
  public.memberships, public.topical_channel_memberships to authenticated;

-- ── The catalog ──────────────────────────────────────────────────────────────────────────────────

select ok(
  (select qual from pg_policies where schemaname = 'public' and tablename = 'posts'
     and policyname = 'posts: read by visibility (crew+ or public)') like '%circle_channels%',
  'the posts policy reads circle_channels');

-- ── Tuned into the second Channel only ──────────────────────────────────────────────────────────

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a730-000000000002')::text, true);

select results_eq(
  $$ select id from public.posts where scope_id = '00000000-0000-4000-e730-000000000001' order by id $$,
  $$ values ('00000000-0000-4000-f730-000000000001'::uuid) $$,
  'ADMITTED NOW: tuned into the second Channel, the member reads the cluster post (and not the group post)');

select results_eq(
  $$ select id from public.scoped_feed_for_viewer(array['00000000-0000-4000-e730-000000000001']::uuid[], 'newest', 10) $$,
  $$ values ('00000000-0000-4000-f730-000000000001'::uuid) $$,
  'scoped_feed_for_viewer says what the policy says');

select ok(
  exists (select 1 from public.feed_for_viewer('newest', 100) where id = '00000000-0000-4000-f730-000000000001'),
  'feed_for_viewer carries the cluster post to the second-Channel member');

select ok(
  not exists (select 1 from public.feed_for_viewer('newest', 100) where id = '00000000-0000-4000-f730-000000000002'),
  'and not the group post');

-- ── Tuned into an unrelated Channel ─────────────────────────────────────────────────────────────

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a730-000000000003')::text, true);

select is_empty(
  $$ select id from public.posts where scope_id = '00000000-0000-4000-e730-000000000001' $$,
  'STILL REFUSED: a member tuned into another Channel reads neither post');

select is_empty(
  $$ select id from public.scoped_feed_for_viewer(array['00000000-0000-4000-e730-000000000001']::uuid[], 'newest', 10) $$,
  'and scoped_feed_for_viewer hands them nothing');

select ok(
  not exists (select 1 from public.feed_for_viewer('newest', 100)
               where id in ('00000000-0000-4000-f730-000000000001', '00000000-0000-4000-f730-000000000002')),
  'and feed_for_viewer hands them nothing');

reset role;

select ok(
  not exists (
    select 1 from information_schema.role_routine_grants
     where routine_schema = 'public' and routine_name in ('feed_for_viewer', 'scoped_feed_for_viewer')
       and privilege_type = 'EXECUTE' and grantee in ('anon', 'PUBLIC')),
  'neither feed RPC is anon-executable (the verdict is authenticated)');

select * from finish();
rollback;
