-- pgTAP guard for migration 20270346085000_hunt_edition_grace.sql (FH-044S, owner decision 2026-11-16).
-- Proves: a run in progress on an edition that was replaced keeps checking in on its own edition for
-- 7 days after the release (the credit lands on that run, against that edition's mission); once the
-- 7 days have passed the claim answers version_superseded and writes nothing; a run on the current
-- edition is unchanged; and the grant stays service_role only. The older guarantees of
-- hunt_claim_apply are still proven by hunt_claim_apply.test.sql, hunt_claim_progress_guard.test.sql,
-- hunt_claim_hold.test.sql and hunt_partner_state.test.sql, which run against this definition.
begin;
select plan(10);

insert into public.profiles (id, display_name, handle) values
  ('00000000-0000-4000-a44f-000000000001', 'FH044S Player', 'fh044s-p'),
  ('00000000-0000-4000-a44f-000000000002', 'FH044S Owner', 'fh044s-o');

-- Hunt a1: edition 1 replaced 3 days ago (inside the window). Hunt a2: edition 1 replaced 8 days ago.
insert into public.hunts (id, slug, owner_profile_id) values
  ('00000000-0000-4000-a44f-0000000000a1', 'fh044s-inside', '00000000-0000-4000-a44f-000000000002'),
  ('00000000-0000-4000-a44f-0000000000a2', 'fh044s-after', '00000000-0000-4000-a44f-000000000002');
insert into public.hunt_versions (id, hunt_id, version_no, status, content_hash, published_at) values
  ('00000000-0000-4000-a44f-0000000000b1', '00000000-0000-4000-a44f-0000000000a1', 1, 'superseded', 'hash-fh044s-a1-1', now() - interval '30 days'),
  ('00000000-0000-4000-a44f-0000000000b2', '00000000-0000-4000-a44f-0000000000a1', 2, 'published', 'hash-fh044s-a1-2', now() - interval '3 days'),
  ('00000000-0000-4000-a44f-0000000000b3', '00000000-0000-4000-a44f-0000000000a2', 1, 'superseded', 'hash-fh044s-a2-1', now() - interval '30 days'),
  ('00000000-0000-4000-a44f-0000000000b4', '00000000-0000-4000-a44f-0000000000a2', 2, 'published', 'hash-fh044s-a2-2', now() - interval '8 days');
update public.hunts set status = 'live', current_version_id = '00000000-0000-4000-a44f-0000000000b2' where id = '00000000-0000-4000-a44f-0000000000a1';
update public.hunts set status = 'live', current_version_id = '00000000-0000-4000-a44f-0000000000b4' where id = '00000000-0000-4000-a44f-0000000000a2';

insert into public.hunt_missions (version_id, hunt_id, mission_key, title, required_assurance) values
  ('00000000-0000-4000-a44f-0000000000b1', '00000000-0000-4000-a44f-0000000000a1', 'stop-1', 'Old first stop', 'none'),
  ('00000000-0000-4000-a44f-0000000000b2', '00000000-0000-4000-a44f-0000000000a1', 'stop-1', 'New first stop', 'none'),
  ('00000000-0000-4000-a44f-0000000000b3', '00000000-0000-4000-a44f-0000000000a2', 'stop-1', 'Old first stop', 'none'),
  ('00000000-0000-4000-a44f-0000000000b4', '00000000-0000-4000-a44f-0000000000a2', 'stop-1', 'New first stop', 'none');
insert into public.hunt_nodes (id, hunt_id) values
  ('00000000-0000-4000-a44f-0000000000f1', '00000000-0000-4000-a44f-0000000000a1'),
  ('00000000-0000-4000-a44f-0000000000f2', '00000000-0000-4000-a44f-0000000000a2');
insert into public.hunt_placements (id, hunt_id, hunt_node_id, slug, medium) values
  ('00000000-0000-4000-a44f-0000000000c1', '00000000-0000-4000-a44f-0000000000a1', '00000000-0000-4000-a44f-0000000000f1', 'fh044s-inside', 'qr'),
  ('00000000-0000-4000-a44f-0000000000c2', '00000000-0000-4000-a44f-0000000000a2', '00000000-0000-4000-a44f-0000000000f2', 'fh044s-after', 'qr');
-- The printed code is bound on both editions, the way a release carries it with its place.
insert into public.hunt_mission_placements (version_id, hunt_id, mission_key, placement_id, venue_space_id, evidence_policy) values
  ('00000000-0000-4000-a44f-0000000000b1', '00000000-0000-4000-a44f-0000000000a1', 'stop-1', '00000000-0000-4000-a44f-0000000000c1', null, '{}'::jsonb),
  ('00000000-0000-4000-a44f-0000000000b2', '00000000-0000-4000-a44f-0000000000a1', 'stop-1', '00000000-0000-4000-a44f-0000000000c1', null, '{}'::jsonb),
  ('00000000-0000-4000-a44f-0000000000b3', '00000000-0000-4000-a44f-0000000000a2', 'stop-1', '00000000-0000-4000-a44f-0000000000c2', null, '{}'::jsonb),
  ('00000000-0000-4000-a44f-0000000000b4', '00000000-0000-4000-a44f-0000000000a2', 'stop-1', '00000000-0000-4000-a44f-0000000000c2', null, '{}'::jsonb);
insert into public.hunt_runs (id, hunt_id, version_id, subject_profile_id, started_at) values
  ('00000000-0000-4000-a44f-0000000000d1', '00000000-0000-4000-a44f-0000000000a1', '00000000-0000-4000-a44f-0000000000b1', '00000000-0000-4000-a44f-000000000001', now() - interval '10 days'),
  ('00000000-0000-4000-a44f-0000000000d2', '00000000-0000-4000-a44f-0000000000a2', '00000000-0000-4000-a44f-0000000000b3', '00000000-0000-4000-a44f-000000000001', now() - interval '10 days'),
  ('00000000-0000-4000-a44f-0000000000d3', '00000000-0000-4000-a44f-0000000000a2', '00000000-0000-4000-a44f-0000000000b4', '00000000-0000-4000-a44f-000000000002', now() - interval '1 day');

-- Inside the window: the run on the replaced edition is credited on its own edition.
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a44f-000000000001', '00000000-0000-4000-a44f-0000000000d1', 'stop-1', '00000000-0000-4000-a44f-0000000000c1', 'ev-fh044s-1', 'signed_node', 'key-fh044s-1', 'hash-fh044s-request-1'))->>'result',
  'credited', 'a run on an edition replaced 3 days ago still checks in');
select is(
  (select version_id::text from public.hunt_progress where run_id = '00000000-0000-4000-a44f-0000000000d1' and mission_key = 'stop-1' and disposition = 'credited'),
  '00000000-0000-4000-a44f-0000000000b1', 'the credit lands on the edition the run started on');
select is(
  (select version_id::text from public.hunt_runs where id = '00000000-0000-4000-a44f-0000000000d1'),
  '00000000-0000-4000-a44f-0000000000b1', 'the run is not moved to the new edition');
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a44f-000000000001', '00000000-0000-4000-a44f-0000000000d1', 'stop-1', '00000000-0000-4000-a44f-0000000000c1', 'ev-fh044s-1', 'signed_node', 'key-fh044s-1', 'hash-fh044s-request-1'))->>'result',
  'credited', 'a retry of the same command replays its stored answer');

-- After the window: a frozen record.
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a44f-000000000001', '00000000-0000-4000-a44f-0000000000d2', 'stop-1', '00000000-0000-4000-a44f-0000000000c2', 'ev-fh044s-2', 'signed_node', 'key-fh044s-2', 'hash-fh044s-request-2'))->>'result',
  'version_superseded', 'a run on an edition replaced 8 days ago takes no new credit');
select is(
  (select count(*)::int from public.hunt_claims where run_id = '00000000-0000-4000-a44f-0000000000d2'),
  0, 'the refusal writes no claim');
select is(
  (select count(*)::int from public.hunt_command_keys where actor_profile_id = '00000000-0000-4000-a44f-000000000001' and idempotency_key = 'key-fh044s-2'),
  0, 'the refusal stores no command key');
select is(
  (select count(*)::int from public.hunt_progress where run_id = '00000000-0000-4000-a44f-0000000000d2'),
  0, 'the record keeps only what it had');

-- A run on the current edition is unchanged.
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a44f-000000000002', '00000000-0000-4000-a44f-0000000000d3', 'stop-1', '00000000-0000-4000-a44f-0000000000c2', 'ev-fh044s-3', 'signed_node', 'key-fh044s-3', 'hash-fh044s-request-3'))->>'result',
  'credited', 'a run on the current edition credits as before');

select is(
  (select has_function_privilege('authenticated', 'public.hunt_claim_apply(uuid, uuid, text, uuid, text, text, text, text, integer)', 'execute')
       or has_function_privilege('anon', 'public.hunt_claim_apply(uuid, uuid, text, uuid, text, text, text, text, integer)', 'execute')),
  false, 'hunt_claim_apply stays service role only');

select * from finish();
rollback;
