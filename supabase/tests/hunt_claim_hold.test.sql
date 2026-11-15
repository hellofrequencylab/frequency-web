-- pgTAP guard for migration 20270346053000_hunt_claim_hold.sql (FH-020U).
-- Proves: without the opt-in the assurance refusal is unchanged and writes nothing; an opted-in
-- placement (evidence_policy.hold_for_review) keeps a qualifying signed-scan shortfall as ONE
-- needs_review claim with the venue from the binding; a held claim creates no progress, outbox event
-- or revision; repeated commands (same key or new key) create no second row; the existing review
-- resumes it exactly once; the grant stays service_role only.
begin;
select plan(22);

insert into public.profiles (id, display_name, handle) values
  ('00000000-0000-4000-a02f-000000000001', 'FH020U Player', 'fh020u-p'),
  ('00000000-0000-4000-a02f-000000000002', 'FH020U Staff', 'fh020u-s');
insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');
insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility) values
  ('00000000-0000-4000-a02f-0000000000e1', 'fh020u-venue', 'FH020U Venue', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-a02f-000000000002', 'active', 'network');
insert into public.hunts (id, slug, owner_profile_id) values ('00000000-0000-4000-a02f-0000000000a1', 'fh020u-one', '00000000-0000-4000-a02f-000000000002');
insert into public.hunt_versions (id, hunt_id, version_no, status, content_hash, published_at) values
  ('00000000-0000-4000-a02f-0000000000b1', '00000000-0000-4000-a02f-0000000000a1', 1, 'published', 'hash-fh020u', now());
update public.hunts set status = 'live', current_version_id = '00000000-0000-4000-a02f-0000000000b1' where id = '00000000-0000-4000-a02f-0000000000a1';
insert into public.hunt_missions (version_id, hunt_id, mission_key, title, required_assurance) values
  ('00000000-0000-4000-a02f-0000000000b1', '00000000-0000-4000-a02f-0000000000a1', 'm1', 'One', 'staff'),
  ('00000000-0000-4000-a02f-0000000000b1', '00000000-0000-4000-a02f-0000000000a1', 'm2', 'Two', 'staff');
insert into public.hunt_nodes (id, hunt_id) values ('00000000-0000-4000-a02f-0000000000f1', '00000000-0000-4000-a02f-0000000000a1');
insert into public.hunt_placements (id, hunt_id, hunt_node_id, slug, medium, revoked_at) values
  ('00000000-0000-4000-a02f-0000000000c1', '00000000-0000-4000-a02f-0000000000a1', '00000000-0000-4000-a02f-0000000000f1', 'fh020u-live', 'qr', null);
insert into public.hunt_mission_placements (version_id, hunt_id, mission_key, placement_id, venue_space_id, evidence_policy) values
  ('00000000-0000-4000-a02f-0000000000b1', '00000000-0000-4000-a02f-0000000000a1', 'm1', '00000000-0000-4000-a02f-0000000000c1', '00000000-0000-4000-a02f-0000000000e1', '{}'::jsonb),
  ('00000000-0000-4000-a02f-0000000000b1', '00000000-0000-4000-a02f-0000000000a1', 'm2', '00000000-0000-4000-a02f-0000000000c1', '00000000-0000-4000-a02f-0000000000e1', '{"hold_for_review": true}'::jsonb);
insert into public.hunt_runs (id, hunt_id, version_id, subject_profile_id) values
  ('00000000-0000-4000-a02f-0000000000d1', '00000000-0000-4000-a02f-0000000000a1', '00000000-0000-4000-a02f-0000000000b1', '00000000-0000-4000-a02f-000000000001');

select is(
  (public.hunt_claim_apply('00000000-0000-4000-a02f-000000000001', '00000000-0000-4000-a02f-0000000000d1', 'm1', '00000000-0000-4000-a02f-0000000000c1', 'ev-1', 'signed_node', 'k-01', 'hash-k-01'))->>'result',
  'assurance_too_low', 'without the opt-in the shortfall is refused as before');
select is(
  (select count(*)::int from public.hunt_claims where run_id = '00000000-0000-4000-a02f-0000000000d1'),
  0, 'the default refusal writes no claim');
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a02f-000000000001', '00000000-0000-4000-a02f-0000000000d1', 'm2', '00000000-0000-4000-a02f-0000000000c1', 'ev-2', 'none', 'k-02', 'hash-k-02'))->>'result',
  'assurance_too_low', 'an opted-in placement does not hold a scan with no assurance at all');
select is(
  (select count(*)::int from public.hunt_claims where run_id = '00000000-0000-4000-a02f-0000000000d1'),
  0, 'a non-qualifying shortfall writes no claim');
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a02f-000000000001', '00000000-0000-4000-a02f-0000000000d1', 'm2', '00000000-0000-4000-a02f-0000000000c1', 'ev-3', 'signed_node', 'k-03', 'hash-k-03'))->>'result',
  'held', 'an opted-in placement holds a signed scan against a staff mission');
select is(
  (select count(*)::int from public.hunt_claims where run_id = '00000000-0000-4000-a02f-0000000000d1' and mission_key = 'm2' and state = 'needs_review'),
  1, 'one needs_review claim exists');
select is(
  (select (policy_result->>'venue_space_id')::uuid from public.hunt_claims where run_id = '00000000-0000-4000-a02f-0000000000d1' and mission_key = 'm2'),
  '00000000-0000-4000-a02f-0000000000e1'::uuid, 'the venue comes from the mission-to-placement binding');
select is(
  (select count(*)::int from public.hunt_progress where run_id = '00000000-0000-4000-a02f-0000000000d1'),
  0, 'a held claim creates no progress');
select is(
  (select count(*)::int from public.hunt_outbox where aggregate_id = '00000000-0000-4000-a02f-0000000000d1'),
  0, 'a held claim creates no outbox event');
select is(
  (select revision from public.hunt_runs where id = '00000000-0000-4000-a02f-0000000000d1'),
  1, 'a held claim does not move the run revision');
select is(
  (select count(*)::int from public.hunt_audit where run_id = '00000000-0000-4000-a02f-0000000000d1' and action = 'claim_held'),
  1, 'the hold is audited');
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a02f-000000000001', '00000000-0000-4000-a02f-0000000000d1', 'm2', '00000000-0000-4000-a02f-0000000000c1', 'ev-3', 'signed_node', 'k-03', 'hash-k-03'))->>'result',
  'held', 'the same command returns the held answer');
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a02f-000000000001', '00000000-0000-4000-a02f-0000000000d1', 'm2', '00000000-0000-4000-a02f-0000000000c1', 'ev-3', 'signed_node', 'k-03', 'hash-k-03'))->>'replayed',
  'true', 'the same key replays its stored answer');
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a02f-000000000001', '00000000-0000-4000-a02f-0000000000d1', 'm2', '00000000-0000-4000-a02f-0000000000c1', 'ev-4', 'signed_node', 'k-04', 'hash-k-04'))->>'claim_id',
  (select id from public.hunt_claims where run_id = '00000000-0000-4000-a02f-0000000000d1' and mission_key = 'm2')::text, 'a new key for the same shortfall returns the same held claim');
select is(
  (select count(*)::int from public.hunt_claims where run_id = '00000000-0000-4000-a02f-0000000000d1' and mission_key = 'm2'),
  1, 'repeated commands never create a second held row');
select is(
  (public.hunt_claim_review((select id from public.hunt_claims where run_id = '00000000-0000-4000-a02f-0000000000d1' and mission_key = 'm2'), '00000000-0000-4000-a02f-000000000002', 'approve', 'Staff saw the player', 'k-05', 'hash-k-05'))->>'result',
  'credited', 'authorized review resumes the held claim');
select is(
  (public.hunt_claim_review((select id from public.hunt_claims where run_id = '00000000-0000-4000-a02f-0000000000d1' and mission_key = 'm2'), '00000000-0000-4000-a02f-000000000002', 'approve', 'Staff saw the player', 'k-06', 'hash-k-06'))->>'result',
  'already_decided', 'a second review does not credit again');
select is(
  (select count(*)::int from public.hunt_progress where run_id = '00000000-0000-4000-a02f-0000000000d1' and mission_key = 'm2'),
  1, 'the mission is credited exactly once');
select is(
  (select count(*)::int from public.hunt_outbox where aggregate_id = '00000000-0000-4000-a02f-0000000000d1'),
  1, 'exactly one outbox event follows the review');
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a02f-000000000001', '00000000-0000-4000-a02f-0000000000d1', 'm2', '00000000-0000-4000-a02f-0000000000c1', 'ev-5', 'signed_node', 'k-07', 'hash-k-07'))->>'result',
  'already_credited', 'after credit a new claim finds it credited');
select is(
  (select has_function_privilege('service_role', 'public.hunt_claim_apply(uuid, uuid, text, uuid, text, text, text, text, integer)', 'execute')),
  true, 'service_role can execute hunt_claim_apply');
select is(
  (select has_function_privilege('authenticated', 'public.hunt_claim_apply(uuid, uuid, text, uuid, text, text, text, text, integer)', 'execute')),
  false, 'authenticated cannot execute hunt_claim_apply');

select * from finish();
rollback;
