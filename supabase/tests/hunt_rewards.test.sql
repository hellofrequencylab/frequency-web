-- pgTAP guard for migration 20270346039000_hunt_rewards.sql (FH-021).
-- One session, one transaction: it proves each answer the grant gives on the sequential path, that the
-- last unit goes to one claimant and the loser is told the published terms, and that the stock count can
-- never pass the stock even for a direct write. It cannot prove two live sessions race safely in one
-- session; the reward row lock carries that (checked by hand with two sessions: the second claimant
-- queued on the lock and answered sold_out), and the check constraint is the backstop.
begin;
select plan(19);

insert into public.profiles (id, display_name, handle) values
  ('00000000-0000-4000-a021-000000000001', 'FH021 A', 'fh021-a'),
  ('00000000-0000-4000-a021-000000000002', 'FH021 B', 'fh021-b'),
  ('00000000-0000-4000-a021-000000000003', 'FH021 C', 'fh021-c');
insert into public.hunts (id, slug, owner_profile_id) values
  ('00000000-0000-4000-a021-0000000000a1', 'fh021-one', '00000000-0000-4000-a021-000000000001');
insert into public.hunt_versions (id, hunt_id, version_no, status, content_hash, published_at) values
  ('00000000-0000-4000-a021-0000000000b1', '00000000-0000-4000-a021-0000000000a1', 1, 'published', 'hash-fh021', now());
update public.hunts set status = 'live', current_version_id = '00000000-0000-4000-a021-0000000000b1'
 where id = '00000000-0000-4000-a021-0000000000a1';
insert into public.hunt_missions (version_id, hunt_id, mission_key, title) values
  ('00000000-0000-4000-a021-0000000000b1', '00000000-0000-4000-a021-0000000000a1', 'm1', 'One');
insert into public.hunt_runs (id, hunt_id, version_id, subject_profile_id, state, completed_at) values
  ('00000000-0000-4000-a021-0000000000d1', '00000000-0000-4000-a021-0000000000a1', '00000000-0000-4000-a021-0000000000b1', '00000000-0000-4000-a021-000000000001', 'completed', now()),
  ('00000000-0000-4000-a021-0000000000d2', '00000000-0000-4000-a021-0000000000a1', '00000000-0000-4000-a021-0000000000b1', '00000000-0000-4000-a021-000000000002', 'completed', now()),
  ('00000000-0000-4000-a021-0000000000d3', '00000000-0000-4000-a021-0000000000a1', '00000000-0000-4000-a021-0000000000b1', '00000000-0000-4000-a021-000000000003', 'active', null);
insert into public.hunt_rewards (id, hunt_id, version_id, reward_key, title, stock, stock_terms) values
  ('00000000-0000-4000-a021-0000000000e1', '00000000-0000-4000-a021-0000000000a1', '00000000-0000-4000-a021-0000000000b1', 'last-one', 'The last one', 1, 'All claimed. Your finish still counts.');
insert into public.hunt_rewards (id, hunt_id, version_id, reward_key, title, stock, eligibility) values
  ('00000000-0000-4000-a021-0000000000e2', '00000000-0000-4000-a021-0000000000a1', '00000000-0000-4000-a021-0000000000b1', 'stop-one', 'Stop one only', null, '{"missions":["m1"]}');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'hunt_reward_grant'
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 'no browser role can execute the grant');

-- The last unit: the first qualifying player gets it, the second is told the published terms.
select is((public.hunt_reward_grant('00000000-0000-4000-a021-000000000001', '00000000-0000-4000-a021-0000000000d1', 'last-one', 'key-fh021-01', 'hash-fh021-request-01'))->>'result',
  'granted', 'the first qualifying player is granted the last unit');
select is((select granted_count from public.hunt_rewards where reward_key = 'last-one'), 1, 'the count moves once');
select is((select count(*)::int from public.hunt_outbox where consumer = 'reward' and semantic_key like 'reward:00000000-0000-4000-a021-0000000000e1:%'), 1, 'one outbox row for the grant');
select is((select count(*)::int from public.hunt_audit where action = 'reward_granted' and run_id = '00000000-0000-4000-a021-0000000000d1'), 1, 'one audit row for the grant');
select is((public.hunt_reward_grant('00000000-0000-4000-a021-000000000002', '00000000-0000-4000-a021-0000000000d2', 'last-one', 'key-fh021-02', 'hash-fh021-request-02'))->>'result',
  'sold_out', 'the second qualifying player finds it gone');
select is((public.hunt_reward_grant('00000000-0000-4000-a021-000000000002', '00000000-0000-4000-a021-0000000000d2', 'last-one', 'key-fh021-03', 'hash-fh021-request-03'))->>'terms',
  'All claimed. Your finish still counts.', 'the loser is shown the published stock terms');
select is((select count(*)::int from public.hunt_reward_grants where reward_id = '00000000-0000-4000-a021-0000000000e1'), 1, 'one grant exists for one unit');
select is((select granted_count from public.hunt_rewards where reward_key = 'last-one'), 1, 'the count did not pass the stock');
select throws_ok(
  $$update public.hunt_rewards set granted_count = 2 where reward_key = 'last-one'$$,
  '23514', null, 'a direct write cannot pass the stock either');

-- Replays and conflicts.
select is((public.hunt_reward_grant('00000000-0000-4000-a021-000000000001', '00000000-0000-4000-a021-0000000000d1', 'last-one', 'key-fh021-01', 'hash-fh021-request-01'))->>'replayed',
  'true', 'the same key replays the answer');
select is((public.hunt_reward_grant('00000000-0000-4000-a021-000000000001', '00000000-0000-4000-a021-0000000000d1', 'last-one', 'key-fh021-01', 'hash-fh021-request-99'))->>'result',
  'key_conflict', 'a reused key with another payload is a conflict');
select is((public.hunt_reward_grant('00000000-0000-4000-a021-000000000001', '00000000-0000-4000-a021-0000000000d1', 'last-one', 'key-fh021-04', 'hash-fh021-request-04'))->>'result',
  'already_granted', 'the same run cannot take it twice under a new key');

-- Eligibility and refusals.
select is((public.hunt_reward_grant('00000000-0000-4000-a021-000000000003', '00000000-0000-4000-a021-0000000000d3', 'last-one', 'key-fh021-05', 'hash-fh021-request-05'))->>'result',
  'not_eligible', 'an unfinished run does not qualify');
select is((public.hunt_reward_grant('00000000-0000-4000-a021-000000000003', '00000000-0000-4000-a021-0000000000d3', 'stop-one', 'key-fh021-06', 'hash-fh021-request-06'))->>'result',
  'not_eligible', 'a named-mission reward needs that mission credited');
select is((public.hunt_reward_grant('00000000-0000-4000-a021-000000000002', '00000000-0000-4000-a021-0000000000d1', 'last-one', 'key-fh021-07', 'hash-fh021-request-07'))->>'result',
  'run_not_found', 'a run that is not the caller''s is not found');
select is((public.hunt_reward_grant('00000000-0000-4000-a021-000000000002', '00000000-0000-4000-a021-0000000000d2', 'nope', 'key-fh021-08', 'hash-fh021-request-08'))->>'result',
  'reward_not_found', 'an unknown reward is not found');

update public.hunts set status = 'paused' where id = '00000000-0000-4000-a021-0000000000a1';
select is((public.hunt_reward_grant('00000000-0000-4000-a021-000000000002', '00000000-0000-4000-a021-0000000000d2', 'last-one', 'key-fh021-09', 'hash-fh021-request-09'))->>'result',
  'hunt_not_live', 'a paused Hunt grants nothing');
update public.hunts set status = 'live' where id = '00000000-0000-4000-a021-0000000000a1';
insert into public.hunt_claims (id, hunt_id, run_id, version_id, mission_key, actor_profile_id, evidence_id, state)
  values ('00000000-0000-4000-a021-0000000000aa', '00000000-0000-4000-a021-0000000000a1', '00000000-0000-4000-a021-0000000000d3',
          '00000000-0000-4000-a021-0000000000b1', 'm1', '00000000-0000-4000-a021-000000000003', 'ev-1', 'accepted');
insert into public.hunt_progress (run_id, mission_key, hunt_id, version_id, credited_claim_id)
  values ('00000000-0000-4000-a021-0000000000d3', 'm1', '00000000-0000-4000-a021-0000000000a1', '00000000-0000-4000-a021-0000000000b1', '00000000-0000-4000-a021-0000000000aa');
select is((public.hunt_reward_grant('00000000-0000-4000-a021-000000000003', '00000000-0000-4000-a021-0000000000d3', 'stop-one', 'key-fh021-10', 'hash-fh021-request-10'))->>'result',
  'granted', 'with the named mission credited the reward is granted before the run ends');

select * from finish();
rollback;
