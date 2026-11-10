-- pgTAP behavioural guard for migration 20270346031000 (FH-005, Frequency Hunts authoring schema).
--
-- What the SQL has to guarantee: the tables are service role only, a Hunt has exactly one owner,
-- and a child row cannot point at another Hunt's version. Runs via `supabase test db`
-- (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(11);

insert into public.profiles (id, display_name, handle) values
  ('00000000-0000-4000-a005-000000000001', 'Fh005 Owner', 'fh005-owner');

-- 1. The grant is the lock.
select is(has_table_privilege('anon', 'public.hunts', 'select'), false, 'anon cannot read hunts');
select is(has_table_privilege('authenticated', 'public.hunt_versions', 'select'), false, 'authenticated cannot read hunt_versions');
select is(has_table_privilege('authenticated', 'public.hunt_missions', 'insert'), false, 'authenticated cannot write hunt_missions');
select is(has_table_privilege('service_role', 'public.hunts', 'insert'), true, 'service_role can write hunts');

-- 2. A Hunt has exactly one owner.
select throws_ok(
  $$insert into public.hunts (slug) values ('fh005-no-owner')$$,
  '23514', null, 'a Hunt with no owner is refused');

insert into public.hunts (id, slug, owner_profile_id) values
  ('00000000-0000-4000-a005-0000000000a1', 'fh005-hunt-a', '00000000-0000-4000-a005-000000000001'),
  ('00000000-0000-4000-a005-0000000000b1', 'fh005-hunt-b', '00000000-0000-4000-a005-000000000001');
insert into public.hunt_versions (id, hunt_id, version_no) values
  ('00000000-0000-4000-a005-0000000000a2', '00000000-0000-4000-a005-0000000000a1', 1),
  ('00000000-0000-4000-a005-0000000000b2', '00000000-0000-4000-a005-0000000000b1', 1);

-- 3. A mission stays inside its own Hunt.
select lives_ok(
  $$insert into public.hunt_missions (version_id, hunt_id, mission_key, title)
    values ('00000000-0000-4000-a005-0000000000a2', '00000000-0000-4000-a005-0000000000a1', 'start', 'Start')$$,
  'a mission in its own Hunt is accepted');
select throws_ok(
  $$insert into public.hunt_missions (version_id, hunt_id, mission_key, title)
    values ('00000000-0000-4000-a005-0000000000a2', '00000000-0000-4000-a005-0000000000b1', 'cross', 'Cross')$$,
  '23503', null, 'a mission cannot name another Hunt for its version');

-- 4. The current version must belong to the same Hunt.
select throws_ok(
  $$update public.hunts set current_version_id = '00000000-0000-4000-a005-0000000000b2'
    where id = '00000000-0000-4000-a005-0000000000a1'$$,
  '23503', null, 'a Hunt cannot point at another Hunt''s version');
select lives_ok(
  $$update public.hunts set current_version_id = '00000000-0000-4000-a005-0000000000a2'
    where id = '00000000-0000-4000-a005-0000000000a1'$$,
  'a Hunt can point at its own version');

-- 5. A published version needs a hash.
select throws_ok(
  $$update public.hunt_versions set status = 'published' where id = '00000000-0000-4000-a005-0000000000a2'$$,
  '23514', null, 'a published version without a content hash is refused');

-- 6. A count rule needs a threshold.
select throws_ok(
  $$insert into public.hunt_rule_groups (version_id, hunt_id, target_finish, logic)
    values ('00000000-0000-4000-a005-0000000000a2', '00000000-0000-4000-a005-0000000000a1', true, 'count')$$,
  '23514', null, 'a count rule with no min_count is refused');

select * from finish();
rollback;
