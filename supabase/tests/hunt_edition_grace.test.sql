-- pgTAP guard for migration 20270346250000_hunt_edition_grace.sql (FH-044S).
-- Owner ruling 2026-11-16: a run in flight when a new edition is released may finish on its own
-- edition for 7 days from that release, then it is a record. Two Hunts: one released just now (inside
-- the grace) and one released 8 days ago (past it). A run on the current edition is unaffected.
begin;
select plan(6);

insert into public.profiles (id, display_name, handle) values
  ('00000000-0000-4000-a144-000000000001', 'FH044S A', 'fh044s-a');
insert into public.hunts (id, slug, owner_profile_id) values
  ('00000000-0000-4000-a144-0000000000a1', 'fh044s-fresh', '00000000-0000-4000-a144-000000000001'),
  ('00000000-0000-4000-a144-0000000000a2', 'fh044s-stale', '00000000-0000-4000-a144-000000000001');
-- Hunt a1: edition 1 replaced by edition 2 just now. Hunt a2: edition 1 replaced 8 days ago.
insert into public.hunt_versions (id, hunt_id, version_no, status, content_hash, published_at) values
  ('00000000-0000-4000-a144-0000000000b1', '00000000-0000-4000-a144-0000000000a1', 1, 'published', 'hash-fh044s-1', now() - interval '20 days'),
  ('00000000-0000-4000-a144-0000000000b2', '00000000-0000-4000-a144-0000000000a1', 2, 'published', 'hash-fh044s-2', now()),
  ('00000000-0000-4000-a144-0000000000b3', '00000000-0000-4000-a144-0000000000a2', 1, 'published', 'hash-fh044s-3', now() - interval '20 days'),
  ('00000000-0000-4000-a144-0000000000b4', '00000000-0000-4000-a144-0000000000a2', 2, 'published', 'hash-fh044s-4', now() - interval '8 days');
update public.hunts set status = 'live', current_version_id = '00000000-0000-4000-a144-0000000000b2' where id = '00000000-0000-4000-a144-0000000000a1';
update public.hunts set status = 'live', current_version_id = '00000000-0000-4000-a144-0000000000b4' where id = '00000000-0000-4000-a144-0000000000a2';
update public.hunt_versions set status = 'superseded'
 where id in ('00000000-0000-4000-a144-0000000000b1', '00000000-0000-4000-a144-0000000000b3');

insert into public.hunt_missions (version_id, hunt_id, mission_key, title, required_assurance) values
  ('00000000-0000-4000-a144-0000000000b1', '00000000-0000-4000-a144-0000000000a1', 'stop-1', 'Old one', 'signed_node'),
  ('00000000-0000-4000-a144-0000000000b2', '00000000-0000-4000-a144-0000000000a1', 'stop-1', 'New one', 'signed_node'),
  ('00000000-0000-4000-a144-0000000000b3', '00000000-0000-4000-a144-0000000000a2', 'stop-1', 'Old one', 'signed_node');
insert into public.hunt_nodes (id, hunt_id) values
  ('00000000-0000-4000-a144-0000000000f1', '00000000-0000-4000-a144-0000000000a1'),
  ('00000000-0000-4000-a144-0000000000f2', '00000000-0000-4000-a144-0000000000a2');
insert into public.hunt_placements (id, hunt_id, hunt_node_id, slug, medium) values
  ('00000000-0000-4000-a144-0000000000c1', '00000000-0000-4000-a144-0000000000a1', '00000000-0000-4000-a144-0000000000f1', 'fh044s-fresh', 'qr'),
  ('00000000-0000-4000-a144-0000000000c2', '00000000-0000-4000-a144-0000000000a2', '00000000-0000-4000-a144-0000000000f2', 'fh044s-stale', 'qr');
-- The sign stays bound on the old edition and follows its place into the new one, as a release does.
insert into public.hunt_mission_placements (version_id, hunt_id, mission_key, placement_id) values
  ('00000000-0000-4000-a144-0000000000b1', '00000000-0000-4000-a144-0000000000a1', 'stop-1', '00000000-0000-4000-a144-0000000000c1'),
  ('00000000-0000-4000-a144-0000000000b2', '00000000-0000-4000-a144-0000000000a1', 'stop-1', '00000000-0000-4000-a144-0000000000c1'),
  ('00000000-0000-4000-a144-0000000000b3', '00000000-0000-4000-a144-0000000000a2', 'stop-1', '00000000-0000-4000-a144-0000000000c2');
insert into public.hunt_runs (id, hunt_id, version_id, subject_profile_id) values
  ('00000000-0000-4000-a144-0000000000d1', '00000000-0000-4000-a144-0000000000a1', '00000000-0000-4000-a144-0000000000b1', '00000000-0000-4000-a144-000000000001'),
  ('00000000-0000-4000-a144-0000000000d2', '00000000-0000-4000-a144-0000000000a2', '00000000-0000-4000-a144-0000000000b3', '00000000-0000-4000-a144-000000000001'),
  ('00000000-0000-4000-a144-0000000000d3', '00000000-0000-4000-a144-0000000000a1', '00000000-0000-4000-a144-0000000000b2', '00000000-0000-4000-a144-000000000001');

select is(
  (public.hunt_claim_apply('00000000-0000-4000-a144-000000000001', '00000000-0000-4000-a144-0000000000d1', 'stop-1',
    '00000000-0000-4000-a144-0000000000c1', 'ev-fresh', 'signed_node', 'key-fh044s-01', 'hash-fh044s-req-01'))->>'result',
  'credited', 'a run on an edition replaced just now still takes credit on its own edition');
select is(
  (select version_id::text from public.hunt_progress where run_id = '00000000-0000-4000-a144-0000000000d1'),
  '00000000-0000-4000-a144-0000000000b1', 'the credit lands on the old edition, never the new rules');
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a144-000000000001', '00000000-0000-4000-a144-0000000000d2', 'stop-1',
    '00000000-0000-4000-a144-0000000000c2', 'ev-stale', 'signed_node', 'key-fh044s-02', 'hash-fh044s-req-02'))->>'result',
  'version_superseded', 'past 7 days from the release the old run is a record');
select is((select count(*)::int from public.hunt_progress where run_id = '00000000-0000-4000-a144-0000000000d2'), 0,
  'and the refusal writes nothing');
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a144-000000000001', '00000000-0000-4000-a144-0000000000d3', 'stop-1',
    '00000000-0000-4000-a144-0000000000c1', 'ev-new', 'signed_node', 'key-fh044s-03', 'hash-fh044s-req-03'))->>'result',
  'credited', 'a run on the current edition plays as before');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'hunt_claim_apply'
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 'no browser role can execute the claim command');

select * from finish();
rollback;
