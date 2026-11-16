-- pgTAP guard for the edition half of migration 20270346072000_hunt_teams_editions.sql (FH-044).
-- It proves that a run stays on the edition it started on, that a published edition's content cannot
-- be rewritten, and that releasing a newer edition leaves an existing run's rules and credits alone.
begin;
select plan(11);

insert into public.profiles (id, display_name, handle) values
  ('00000000-0000-4000-a044-000000000001', 'FH044 A', 'fh044-a');
insert into public.hunts (id, slug, owner_profile_id) values
  ('00000000-0000-4000-a044-0000000000a1', 'fh044-one', '00000000-0000-4000-a044-000000000001'),
  ('00000000-0000-4000-a044-0000000000a2', 'fh044-two', '00000000-0000-4000-a044-000000000001');
insert into public.hunt_versions (id, hunt_id, version_no, status, content_hash, published_at, policy) values
  ('00000000-0000-4000-a044-0000000000b1', '00000000-0000-4000-a044-0000000000a1', 1, 'published', 'hash-fh044-1', now(), '{"trail":{"title":"Spring"}}'),
  ('00000000-0000-4000-a044-0000000000b2', '00000000-0000-4000-a044-0000000000a1', 2, 'draft', null, null, '{"trail":{"title":"Summer"}}'),
  ('00000000-0000-4000-a044-0000000000b9', '00000000-0000-4000-a044-0000000000a2', 1, 'published', 'hash-fh044-9', now(), '{}');
update public.hunts set status = 'live', current_version_id = '00000000-0000-4000-a044-0000000000b1'
 where id = '00000000-0000-4000-a044-0000000000a1';
insert into public.hunt_missions (version_id, hunt_id, mission_key, title) values
  ('00000000-0000-4000-a044-0000000000b1', '00000000-0000-4000-a044-0000000000a1', 'stop-1', 'Old first stop'),
  ('00000000-0000-4000-a044-0000000000b2', '00000000-0000-4000-a044-0000000000a1', 'stop-1', 'New first stop');
insert into public.hunt_runs (id, hunt_id, version_id, subject_profile_id) values
  ('00000000-0000-4000-a044-0000000000d1', '00000000-0000-4000-a044-0000000000a1', '00000000-0000-4000-a044-0000000000b1', '00000000-0000-4000-a044-000000000001');
insert into public.hunt_claims (id, hunt_id, run_id, version_id, mission_key, actor_profile_id, evidence_id, state) values
  ('00000000-0000-4000-a044-0000000000e1', '00000000-0000-4000-a044-0000000000a1', '00000000-0000-4000-a044-0000000000d1',
   '00000000-0000-4000-a044-0000000000b1', 'stop-1', '00000000-0000-4000-a044-000000000001', 'ev-1', 'accepted');
insert into public.hunt_progress (run_id, mission_key, hunt_id, version_id, credited_claim_id) values
  ('00000000-0000-4000-a044-0000000000d1', 'stop-1', '00000000-0000-4000-a044-0000000000a1', '00000000-0000-4000-a044-0000000000b1', '00000000-0000-4000-a044-0000000000e1');

-- A run is pinned.
select throws_ok(
  $$update public.hunt_runs set version_id = '00000000-0000-4000-a044-0000000000b2' where id = '00000000-0000-4000-a044-0000000000d1'$$,
  '23514', null, 'a run cannot be moved to another edition');
select lives_ok(
  $$update public.hunt_runs set revision = revision + 1, last_activity_at = now() where id = '00000000-0000-4000-a044-0000000000d1'$$,
  'ordinary run activity still writes');

-- A published edition is frozen.
select throws_ok(
  $$update public.hunt_versions set content_hash = 'other' where id = '00000000-0000-4000-a044-0000000000b1'$$,
  '23514', null, 'a published edition keeps its content hash');
select throws_ok(
  $$update public.hunt_versions set policy = '{"trail":{"title":"Rewritten"}}' where id = '00000000-0000-4000-a044-0000000000b1'$$,
  '23514', null, 'a published edition keeps its trail');
select throws_ok(
  $$update public.hunt_versions set status = 'draft', content_hash = null, published_at = null where id = '00000000-0000-4000-a044-0000000000b1'$$,
  '23514', null, 'a published edition cannot go back to draft');
select lives_ok(
  $$update public.hunt_versions set policy = policy || '{"edition":{"label":"Spring"}}' where id = '00000000-0000-4000-a044-0000000000b1'$$,
  'notes beside the trail (the edition label, the crosswalk) may still be written');

-- Release the next edition the way lib/hunts/edition-store.ts does: publish, repoint, supersede.
select lives_ok(
  $$update public.hunt_versions set status = 'published', content_hash = 'hash-fh044-2', published_at = now() where id = '00000000-0000-4000-a044-0000000000b2'$$,
  'the open draft publishes');
update public.hunts set current_version_id = '00000000-0000-4000-a044-0000000000b2' where id = '00000000-0000-4000-a044-0000000000a1';
select lives_ok(
  $$update public.hunt_versions set status = 'superseded' where id = '00000000-0000-4000-a044-0000000000b1'$$,
  'the outgoing edition moves forward to superseded');
select throws_ok(
  $$update public.hunt_versions set status = 'published' where id = '00000000-0000-4000-a044-0000000000b1'$$,
  '23514', null, 'a superseded edition never comes back');

-- The existing run keeps its rules and its credits.
select is(
  (select m.title from public.hunt_runs r join public.hunt_missions m on m.version_id = r.version_id and m.mission_key = 'stop-1'
    where r.id = '00000000-0000-4000-a044-0000000000d1'),
  'Old first stop', 'the existing run still reads the rules of the edition it started on');
select is((select count(*)::int from public.hunt_progress where run_id = '00000000-0000-4000-a044-0000000000d1' and disposition = 'credited'),
  1, 'and keeps its credits');

select * from finish();
rollback;
