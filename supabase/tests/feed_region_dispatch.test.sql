-- SCAN-839 proof (20270346013500_feed_reads_region_dispatch.sql).
--
-- A Mentor's nexus Dispatch is a `region` post scoped to the nexus region. The posts policy admitted it
-- to a member of that region; the two SECURITY DEFINER feed RPCs did not, so it showed nowhere. Proven
-- from both sides: a member of the region reads it through both RPCs (ADMITTED NOW), a member of another
-- region does not, and the RPCs stay authenticated-only.
--
-- One transaction, rolled back: nothing persists. Fixture style follows feed_rls_space_scope.test.sql.

begin;
select plan(7);

insert into public.nexus_regions (id, name, slug, depth) values
  ('00000000-0000-4000-a390-0000000000a1', 'L839 Region A', 'l839-region-a', 0),
  ('00000000-0000-4000-a390-0000000000a2', 'L839 Region B', 'l839-region-b', 0);

insert into auth.users (id, email) values
  ('00000000-0000-4000-a390-000000000001', 'l839-in@test.local'),
  ('00000000-0000-4000-a390-000000000002', 'l839-out@test.local');

insert into public.profiles (id, auth_user_id, display_name, handle, community_role, nexus_region_id) values
  ('00000000-0000-4000-b390-000000000001', '00000000-0000-4000-a390-000000000001', 'L839 In', 'l839-in', 'member', '00000000-0000-4000-a390-0000000000a1'),
  ('00000000-0000-4000-b390-000000000002', '00000000-0000-4000-a390-000000000002', 'L839 Out', 'l839-out', 'member', '00000000-0000-4000-a390-0000000000a2');

-- trg_on_auth_user_created auto-provisions a profile per auth.users row; keep only the fixed ids.
delete from public.profiles
where auth_user_id in ('00000000-0000-4000-a390-000000000001', '00000000-0000-4000-a390-000000000002')
  and id not in ('00000000-0000-4000-b390-000000000001', '00000000-0000-4000-b390-000000000002');

-- The Dispatch: a region post in Region A, authored by the member who sits in Region A.
insert into public.posts (id, author_id, body, scope_id, visibility, post_type, parent_id) values
  ('00000000-0000-4000-f390-000000000001', '00000000-0000-4000-b390-000000000001', 'L839 Dispatch to Region A',
   '00000000-0000-4000-a390-0000000000a1', 'region', 'feed', null);

-- The open-feed flag would admit everything; this proof is about the region arm alone.
insert into public.platform_flags (key, value) values ('feed_open', false)
on conflict (key) do update set value = false;

select ok(
  (select pg_get_functiondef('public.feed_for_viewer(text,integer,double precision,double precision,integer)'::regprocedure)
     like '%get_my_region_id()%'),
  'feed_for_viewer carries the region arm');
select ok(
  (select pg_get_functiondef('public.scoped_feed_for_viewer(uuid[],text,integer)'::regprocedure)
     like '%get_my_region_id()%'),
  'scoped_feed_for_viewer carries the region arm');
select ok(not has_function_privilege('anon', 'public.feed_for_viewer(text,integer,double precision,double precision,integer)', 'execute'),
  'feed_for_viewer is not anon-executable');

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a390-000000000001', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select count(*)::int from public.feed_for_viewer('newest', 100) where id = '00000000-0000-4000-f390-000000000001' $$,
  $$ values (1) $$,
  'a member of the region reads the Dispatch in the feed (ADMITTED NOW)');
select results_eq(
  $$ select count(*)::int from public.scoped_feed_for_viewer(array['00000000-0000-4000-a390-0000000000a1']::uuid[], 'newest', 30)
      where id = '00000000-0000-4000-f390-000000000001' $$,
  $$ values (1) $$,
  'and in the region-scoped feed');

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a390-000000000002', 'role', 'authenticated')::text, true);

select is_empty(
  $$ select id from public.feed_for_viewer('newest', 100) where id = '00000000-0000-4000-f390-000000000001' $$,
  'a member of another region does not read it in the feed');
select is_empty(
  $$ select id from public.scoped_feed_for_viewer(array['00000000-0000-4000-a390-0000000000a1']::uuid[], 'newest', 30)
      where id = '00000000-0000-4000-f390-000000000001' $$,
  'nor in the region-scoped feed');

select * from finish();
rollback;
