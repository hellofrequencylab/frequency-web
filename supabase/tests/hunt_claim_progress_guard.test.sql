-- pgTAP guard for migration 20270346052000_hunt_claim_progress_guard.sql (FH-049T).
-- One session cannot run two live transactions, so a concurrent progress write is modelled the way it
-- lands in production: the caller takes its snapshot count, then a progress row for the same run is
-- committed by someone else, then the caller applies its claim with the count it read. Under the run
-- lock the function sees a different total and must answer stale_progress and write nothing. It also
-- proves the retry with a reread count credits, that a stale answer is repeatable and stores no key
-- (so the adapter's single retry is the only bound it needs), that reversed rows count toward the total,
-- that a null count keeps the FH-010 behaviour, that a replayed key still replays first, and that the
-- old eight-argument signature is gone and only service_role can execute the new one.
begin;
select plan(17);

insert into public.profiles (id, display_name, handle) values
  ('00000000-0000-4000-a049-000000000001', 'FH049T A', 'fh049t-a');
insert into public.hunts (id, slug, owner_profile_id) values
  ('00000000-0000-4000-a049-0000000000a1', 'fh049t-one', '00000000-0000-4000-a049-000000000001');
insert into public.hunt_versions (id, hunt_id, version_no, status, content_hash, published_at) values
  ('00000000-0000-4000-a049-0000000000b1', '00000000-0000-4000-a049-0000000000a1', 1, 'published', 'hash-fh049t', now());
update public.hunts set status = 'live', current_version_id = '00000000-0000-4000-a049-0000000000b1'
 where id = '00000000-0000-4000-a049-0000000000a1';
insert into public.hunt_missions (version_id, hunt_id, mission_key, title, required_assurance, opens_at, closes_at) values
  ('00000000-0000-4000-a049-0000000000b1', '00000000-0000-4000-a049-0000000000a1', 'm1', 'One', 'signed_node', null, null),
  ('00000000-0000-4000-a049-0000000000b1', '00000000-0000-4000-a049-0000000000a1', 'm2', 'Two', 'signed_node', null, null),
  ('00000000-0000-4000-a049-0000000000b1', '00000000-0000-4000-a049-0000000000a1', 'm3', 'Three', 'signed_node', null, null),
  ('00000000-0000-4000-a049-0000000000b1', '00000000-0000-4000-a049-0000000000a1', 'm4', 'Four', 'signed_node', null, null),
  ('00000000-0000-4000-a049-0000000000b1', '00000000-0000-4000-a049-0000000000a1', 'm5', 'Five', 'signed_node', null, null);
insert into public.hunt_nodes (id, hunt_id) values
  ('00000000-0000-4000-a049-0000000000f1', '00000000-0000-4000-a049-0000000000a1');
insert into public.hunt_placements (id, hunt_id, hunt_node_id, slug, medium, revoked_at) values
  ('00000000-0000-4000-a049-0000000000c1', '00000000-0000-4000-a049-0000000000a1', '00000000-0000-4000-a049-0000000000f1', 'fh049t-live', 'qr', null);
insert into public.hunt_mission_placements (version_id, hunt_id, mission_key, placement_id) values
  ('00000000-0000-4000-a049-0000000000b1', '00000000-0000-4000-a049-0000000000a1', 'm1', '00000000-0000-4000-a049-0000000000c1'),
  ('00000000-0000-4000-a049-0000000000b1', '00000000-0000-4000-a049-0000000000a1', 'm2', '00000000-0000-4000-a049-0000000000c1'),
  ('00000000-0000-4000-a049-0000000000b1', '00000000-0000-4000-a049-0000000000a1', 'm3', '00000000-0000-4000-a049-0000000000c1'),
  ('00000000-0000-4000-a049-0000000000b1', '00000000-0000-4000-a049-0000000000a1', 'm4', '00000000-0000-4000-a049-0000000000c1'),
  ('00000000-0000-4000-a049-0000000000b1', '00000000-0000-4000-a049-0000000000a1', 'm5', '00000000-0000-4000-a049-0000000000c1');
insert into public.hunt_runs (id, hunt_id, version_id, subject_profile_id) values
  ('00000000-0000-4000-a049-0000000000d1', '00000000-0000-4000-a049-0000000000a1',
   '00000000-0000-4000-a049-0000000000b1', '00000000-0000-4000-a049-000000000001');

-- Signature and grants (3)
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'hunt_claim_apply'),
  1, 'exactly one hunt_claim_apply exists: the old signature was replaced, not overloaded');
select is(
  (select p.pronargs::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'hunt_claim_apply'),
  9, 'the surviving signature takes the expected progress count');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'hunt_claim_apply'
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')
           or not has_function_privilege('service_role', p.oid, 'execute'))),
  0, 'only service_role can execute the claim command');

-- A null count keeps the FH-010 behaviour (2)
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a049-000000000001', '00000000-0000-4000-a049-0000000000d1', 'm1',
    '00000000-0000-4000-a049-0000000000c1', 'ev-one', 'signed_node', 'key-fh049t-01', 'hash-fh049t-request-01'))->>'result',
  'credited', 'an eight-argument call (null count) still credits');
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a049-000000000001', '00000000-0000-4000-a049-0000000000d1', 'm2',
    '00000000-0000-4000-a049-0000000000c1', 'ev-two', 'signed_node', 'key-fh049t-02', 'hash-fh049t-request-02', null))->>'result',
  'credited', 'an explicit null count credits too');

-- Run now holds two rows. A matching count credits (1)
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a049-000000000001', '00000000-0000-4000-a049-0000000000d1', 'm3',
    '00000000-0000-4000-a049-0000000000c1', 'ev-three', 'signed_node', 'key-fh049t-03', 'hash-fh049t-request-03', 2))->>'result',
  'credited', 'a count that matches the run total credits');

-- The caller read 3 rows; another session then commits one more progress row for the run (model of the race).
insert into public.hunt_claims (hunt_id, run_id, version_id, mission_key, actor_profile_id, evidence_id, state, assurance)
values ('00000000-0000-4000-a049-0000000000a1', '00000000-0000-4000-a049-0000000000d1', '00000000-0000-4000-a049-0000000000b1',
        'm5', '00000000-0000-4000-a049-000000000001', 'ev-concurrent', 'accepted', 'signed_node');
insert into public.hunt_progress (run_id, mission_key, hunt_id, version_id, credited_claim_id)
select '00000000-0000-4000-a049-0000000000d1', 'm5', '00000000-0000-4000-a049-0000000000a1',
       '00000000-0000-4000-a049-0000000000b1', id
  from public.hunt_claims where run_id = '00000000-0000-4000-a049-0000000000d1' and mission_key = 'm5';

select is(
  (public.hunt_claim_apply('00000000-0000-4000-a049-000000000001', '00000000-0000-4000-a049-0000000000d1', 'm4',
    '00000000-0000-4000-a049-0000000000c1', 'ev-four', 'signed_node', 'key-fh049t-04', 'hash-fh049t-request-04', 3))->>'result',
  'stale_progress', 'a count read before a concurrent progress write cannot credit');
select is((select count(*)::int from public.hunt_progress where run_id = '00000000-0000-4000-a049-0000000000d1' and mission_key = 'm4'), 0,
  'a stale answer writes no progress');
select is((select count(*)::int from public.hunt_claims where run_id = '00000000-0000-4000-a049-0000000000d1' and mission_key = 'm4'), 0,
  'a stale answer writes no claim');
select is((select count(*)::int from public.hunt_outbox where semantic_key = 'credit:00000000-0000-4000-a049-0000000000d1:m4'), 0,
  'a stale answer writes no outbox row');
select is((select count(*)::int from public.hunt_audit where run_id = '00000000-0000-4000-a049-0000000000d1' and target_kind = 'claim'
             and after_state->>'mission_key' = 'm4'), 0,
  'a stale answer writes no audit row');
select is((select count(*)::int from public.hunt_command_keys where idempotency_key = 'key-fh049t-04'), 0,
  'a stale answer stores no idempotency key, so the retry is a fresh command');
select is((select revision from public.hunt_runs where id = '00000000-0000-4000-a049-0000000000d1'), 4,
  'a stale answer does not move the run revision');

-- Bounded: the stale answer is repeatable and never turns into a credit by itself (1)
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a049-000000000001', '00000000-0000-4000-a049-0000000000d1', 'm4',
    '00000000-0000-4000-a049-0000000000c1', 'ev-four', 'signed_node', 'key-fh049t-04', 'hash-fh049t-request-04', 3))->>'result',
  'stale_progress', 'repeating the stale count is stale again; only a reread count can proceed');

-- Reversed rows count toward the total (1)
update public.hunt_progress set disposition = 'reversed'
 where run_id = '00000000-0000-4000-a049-0000000000d1' and mission_key = 'm5';
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a049-000000000001', '00000000-0000-4000-a049-0000000000d1', 'm4',
    '00000000-0000-4000-a049-0000000000c1', 'ev-four', 'signed_node', 'key-fh049t-04', 'hash-fh049t-request-04', 3))->>'result',
  'stale_progress', 'a count of credited rows only is stale when a reversed row exists');

-- The retry with the reread total credits (1)
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a049-000000000001', '00000000-0000-4000-a049-0000000000d1', 'm4',
    '00000000-0000-4000-a049-0000000000c1', 'ev-four', 'signed_node', 'key-fh049t-04', 'hash-fh049t-request-04', 4))->>'result',
  'credited', 'the retry with the reread total credits');

-- A replayed key replays before the count is compared (1)
select is(
  (public.hunt_claim_apply('00000000-0000-4000-a049-000000000001', '00000000-0000-4000-a049-0000000000d1', 'm4',
    '00000000-0000-4000-a049-0000000000c1', 'ev-four', 'signed_node', 'key-fh049t-04', 'hash-fh049t-request-04', 1))->>'replayed',
  'true', 'a replay of a stored command returns its answer regardless of the count');

select * from finish();
rollback;
