-- pgTAP guard for migration 20270346037000_hunt_claim_apply.sql (FH-010).
-- One session, one transaction: it proves each answer the command gives on the sequential path, that
-- a credit writes the claim, progress, audit, outbox and key together, and that a refusal writes
-- nothing. It cannot prove two live sessions race safely; the advisory lock and the run row lock carry
-- that, and the FH-006 keys are the backstop if either were ever bypassed.
begin;
select plan(15);

insert into public.profiles (id, display_name, handle) values
  ('00000000-0000-4000-a010-000000000001', 'FH010 A', 'fh010-a'),
  ('00000000-0000-4000-a010-000000000002', 'FH010 B', 'fh010-b');
insert into public.hunts (id, slug, owner_profile_id) values
  ('00000000-0000-4000-a010-0000000000a1', 'fh010-one', '00000000-0000-4000-a010-000000000001');
insert into public.hunt_versions (id, hunt_id, version_no, status, content_hash, published_at) values
  ('00000000-0000-4000-a010-0000000000b1', '00000000-0000-4000-a010-0000000000a1', 1, 'published', 'hash-fh010', now());
update public.hunts set status = 'live', current_version_id = '00000000-0000-4000-a010-0000000000b1'
 where id = '00000000-0000-4000-a010-0000000000a1';
insert into public.hunt_missions (version_id, hunt_id, mission_key, title, required_assurance, opens_at, closes_at) values
  ('00000000-0000-4000-a010-0000000000b1', '00000000-0000-4000-a010-0000000000a1', 'm1', 'Shop one', 'signed_node', null, null),
  ('00000000-0000-4000-a010-0000000000b1', '00000000-0000-4000-a010-0000000000a1', 'm2', 'Staff only', 'staff', null, null),
  ('00000000-0000-4000-a010-0000000000b1', '00000000-0000-4000-a010-0000000000a1', 'm3', 'Old plaque', 'signed_node', null, null),
  ('00000000-0000-4000-a010-0000000000b1', '00000000-0000-4000-a010-0000000000a1', 'm4', 'Last week', 'signed_node', now() - interval '2 hours', now() - interval '1 hour'),
  ('00000000-0000-4000-a010-0000000000b1', '00000000-0000-4000-a010-0000000000a1', 'm5', 'Paused', 'signed_node', null, null);
insert into public.hunt_nodes (id, hunt_id) values
  ('00000000-0000-4000-a010-0000000000f1', '00000000-0000-4000-a010-0000000000a1');
insert into public.hunt_placements (id, hunt_id, hunt_node_id, slug, medium, revoked_at) values
  ('00000000-0000-4000-a010-0000000000c1', '00000000-0000-4000-a010-0000000000a1', '00000000-0000-4000-a010-0000000000f1', 'fh010-live', 'qr', null),
  ('00000000-0000-4000-a010-0000000000c2', '00000000-0000-4000-a010-0000000000a1', '00000000-0000-4000-a010-0000000000f1', 'fh010-gone', 'qr', now());
insert into public.hunt_mission_placements (version_id, hunt_id, mission_key, placement_id) values
  ('00000000-0000-4000-a010-0000000000b1', '00000000-0000-4000-a010-0000000000a1', 'm1', '00000000-0000-4000-a010-0000000000c1'),
  ('00000000-0000-4000-a010-0000000000b1', '00000000-0000-4000-a010-0000000000a1', 'm2', '00000000-0000-4000-a010-0000000000c1'),
  ('00000000-0000-4000-a010-0000000000b1', '00000000-0000-4000-a010-0000000000a1', 'm3', '00000000-0000-4000-a010-0000000000c2'),
  ('00000000-0000-4000-a010-0000000000b1', '00000000-0000-4000-a010-0000000000a1', 'm4', '00000000-0000-4000-a010-0000000000c1'),
  ('00000000-0000-4000-a010-0000000000b1', '00000000-0000-4000-a010-0000000000a1', 'm5', '00000000-0000-4000-a010-0000000000c1');
insert into public.hunt_runs (id, hunt_id, version_id, subject_profile_id) values
  ('00000000-0000-4000-a010-0000000000d1', '00000000-0000-4000-a010-0000000000a1',
   '00000000-0000-4000-a010-0000000000b1', '00000000-0000-4000-a010-000000000001');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'hunt_claim_apply'
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 'no browser role can execute the claim command');

select is(
  (public.hunt_claim_apply('00000000-0000-4000-a010-000000000001', '00000000-0000-4000-a010-0000000000d1', 'm1',
    '00000000-0000-4000-a010-0000000000c1', 'ev-one', 'signed_node', 'key-fh010-01', 'hash-fh010-request-01'))->>'result',
  'credited', 'a live placement credits the mission');
select is((select count(*)::int from public.hunt_progress where run_id = '00000000-0000-4000-a010-0000000000d1'), 1,
  'one credit is written');
select is((select count(*)::int from public.hunt_outbox where semantic_key = 'credit:00000000-0000-4000-a010-0000000000d1:m1'), 1,
  'one outbox row is written with the credit');
select is((select count(*)::int from public.hunt_audit where run_id = '00000000-0000-4000-a010-0000000000d1' and action = 'claim_accepted'), 1,
  'one audit row is written with the credit');
select is((select revision from public.hunt_runs where id = '00000000-0000-4000-a010-0000000000d1'), 2,
  'the run revision moves once');

select is(
  (public.hunt_claim_apply('00000000-0000-4000-a010-000000000001', '00000000-0000-4000-a010-0000000000d1', 'm1',
    '00000000-0000-4000-a010-0000000000c1', 'ev-one', 'signed_node', 'key-fh010-01', 'hash-fh010-request-01'))->>'replayed',
  'true', 'the same key and payload replays the stored answer');
select is((select count(*)::int from public.hunt_claims where run_id = '00000000-0000-4000-a010-0000000000d1'), 1,
  'a replay adds no claim');
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a010-000000000001', '00000000-0000-4000-a010-0000000000d1', 'm1',
    '00000000-0000-4000-a010-0000000000c1', 'ev-two', 'signed_node', 'key-fh010-01', 'hash-fh010-request-02'))->>'result',
  'key_conflict', 'the same key with another payload is a conflict');
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a010-000000000001', '00000000-0000-4000-a010-0000000000d1', 'm1',
    '00000000-0000-4000-a010-0000000000c1', 'ev-two', 'signed_node', 'key-fh010-02', 'hash-fh010-request-02'))->>'result',
  'already_credited', 'a second proof for a credited mission earns nothing');
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a010-000000000002', '00000000-0000-4000-a010-0000000000d1', 'm2',
    '00000000-0000-4000-a010-0000000000c1', 'ev-x', 'staff', 'key-fh010-03', 'hash-fh010-request-03'))->>'result',
  'run_not_found', 'another member cannot claim on this run');
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a010-000000000001', '00000000-0000-4000-a010-0000000000d1', 'm2',
    '00000000-0000-4000-a010-0000000000c1', 'ev-y', 'signed_node', 'key-fh010-04', 'hash-fh010-request-04'))->>'result',
  'assurance_too_low', 'a signed code cannot satisfy a staff mission');
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a010-000000000001', '00000000-0000-4000-a010-0000000000d1', 'm3',
    '00000000-0000-4000-a010-0000000000c2', 'ev-z', 'signed_node', 'key-fh010-05', 'hash-fh010-request-05'))->>'result',
  'placement_not_valid', 'a revoked placement credits nothing');

select is(
  (public.hunt_claim_apply('00000000-0000-4000-a010-000000000001', '00000000-0000-4000-a010-0000000000d1', 'm4',
    '00000000-0000-4000-a010-0000000000c1', 'ev-w', 'signed_node', 'key-fh010-07', 'hash-fh010-request-07'))->>'result',
  'mission_closed', 'a mission past its window credits nothing');

update public.hunts set status = 'paused' where id = '00000000-0000-4000-a010-0000000000a1';
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a010-000000000001', '00000000-0000-4000-a010-0000000000d1', 'm5',
    '00000000-0000-4000-a010-0000000000c1', 'ev-p', 'signed_node', 'key-fh010-06', 'hash-fh010-request-06'))->>'result',
  'hunt_not_live', 'a paused Hunt credits nothing');

select * from finish();
rollback;
