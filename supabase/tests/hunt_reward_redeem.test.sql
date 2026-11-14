-- pgTAP guard for migration 20270346046000_hunt_reward_redeem.sql (FH-022).
-- One session, one transaction: it proves each answer redeem and void give on the sequential path, that
-- a grant is handed over exactly once (the second terminal reads already_redeemed), that a voided,
-- expired or unknown grant is never redeemed, and that a retry with the same key replays one answer.
-- It cannot prove two live sessions race safely in one session; the grant row lock carries that.
begin;
select plan(20);

insert into public.profiles (id, display_name, handle) values
  ('00000000-0000-4000-a022-000000000001', 'FH022 Player A', 'fh022-a'),
  ('00000000-0000-4000-a022-000000000002', 'FH022 Player B', 'fh022-b'),
  ('00000000-0000-4000-a022-000000000011', 'FH022 Staff 1', 'fh022-s1'),
  ('00000000-0000-4000-a022-000000000012', 'FH022 Staff 2', 'fh022-s2');
insert into public.hunts (id, slug, owner_profile_id) values
  ('00000000-0000-4000-a022-0000000000a1', 'fh022-one', '00000000-0000-4000-a022-000000000011');
insert into public.hunt_versions (id, hunt_id, version_no, status, content_hash, published_at) values
  ('00000000-0000-4000-a022-0000000000b1', '00000000-0000-4000-a022-0000000000a1', 1, 'published', 'hash-fh022', now());
update public.hunts set status = 'live', current_version_id = '00000000-0000-4000-a022-0000000000b1'
 where id = '00000000-0000-4000-a022-0000000000a1';
insert into public.hunt_missions (version_id, hunt_id, mission_key, title) values
  ('00000000-0000-4000-a022-0000000000b1', '00000000-0000-4000-a022-0000000000a1', 'm1', 'One');
insert into public.hunt_runs (id, hunt_id, version_id, subject_profile_id, state, completed_at) values
  ('00000000-0000-4000-a022-0000000000d1', '00000000-0000-4000-a022-0000000000a1', '00000000-0000-4000-a022-0000000000b1', '00000000-0000-4000-a022-000000000001', 'completed', now()),
  ('00000000-0000-4000-a022-0000000000d2', '00000000-0000-4000-a022-0000000000a1', '00000000-0000-4000-a022-0000000000b1', '00000000-0000-4000-a022-000000000002', 'completed', now());
insert into public.hunt_rewards (id, hunt_id, version_id, reward_key, title) values
  ('00000000-0000-4000-a022-0000000000e1', '00000000-0000-4000-a022-0000000000a1', '00000000-0000-4000-a022-0000000000b1', 'free-tea', 'A free tea'),
  ('00000000-0000-4000-a022-0000000000e2', '00000000-0000-4000-a022-0000000000a1', '00000000-0000-4000-a022-0000000000b1', 'sticker', 'A sticker');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('hunt_reward_redeem', 'hunt_reward_void')
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 'no browser role can execute redeem or void');

select is((public.hunt_reward_grant('00000000-0000-4000-a022-000000000001', '00000000-0000-4000-a022-0000000000d1', 'free-tea', 'key-fh022-g1', 'hash-fh022-grant-01'))->>'result', 'granted', 'player A holds a free tea');
select is((public.hunt_reward_grant('00000000-0000-4000-a022-000000000002', '00000000-0000-4000-a022-0000000000d2', 'free-tea', 'key-fh022-g2', 'hash-fh022-grant-02'))->>'result', 'granted', 'player B holds a free tea');
select is((public.hunt_reward_grant('00000000-0000-4000-a022-000000000001', '00000000-0000-4000-a022-0000000000d1', 'sticker', 'key-fh022-g3', 'hash-fh022-grant-03'))->>'result', 'granted', 'player A holds a sticker');

-- Two terminals, one grant.
select is((public.hunt_reward_redeem('00000000-0000-4000-a022-000000000011', (select id from public.hunt_reward_grants where reward_id = '00000000-0000-4000-a022-0000000000e1' and profile_id = '00000000-0000-4000-a022-000000000001'), '00000000-0000-4000-a022-0000000000f1', 'key-fh022-r1', 'hash-fh022-redeem-01'))->>'result',
  'redeemed', 'the first terminal hands the tea over');
select is((public.hunt_reward_redeem('00000000-0000-4000-a022-000000000012', (select id from public.hunt_reward_grants where reward_id = '00000000-0000-4000-a022-0000000000e1' and profile_id = '00000000-0000-4000-a022-000000000001'), '00000000-0000-4000-a022-0000000000f1', 'key-fh022-r2', 'hash-fh022-redeem-02'))->>'result',
  'already_redeemed', 'the second terminal is told it was already redeemed');
select is((select state from public.hunt_reward_grants where reward_id = '00000000-0000-4000-a022-0000000000e1' and profile_id = '00000000-0000-4000-a022-000000000001'), 'redeemed', 'the grant is redeemed');
select is((select redeemed_by from public.hunt_reward_grants where reward_id = '00000000-0000-4000-a022-0000000000e1' and profile_id = '00000000-0000-4000-a022-000000000001'), '00000000-0000-4000-a022-000000000011'::uuid, 'the first terminal is the one on record');
select is((select count(*)::int from public.hunt_outbox where event_type = 'reward.redeemed'), 1, 'one outbox row for the redemption');
select is((select count(*)::int from public.hunt_audit where action = 'reward_redeemed'), 1, 'one audit row for the redemption');

-- Retry and conflict.
select is((public.hunt_reward_redeem('00000000-0000-4000-a022-000000000011', (select id from public.hunt_reward_grants where reward_id = '00000000-0000-4000-a022-0000000000e1' and profile_id = '00000000-0000-4000-a022-000000000001'), '00000000-0000-4000-a022-0000000000f1', 'key-fh022-r1', 'hash-fh022-redeem-01'))->>'replayed', 'true', 'the same key replays the first answer');
select is((public.hunt_reward_redeem('00000000-0000-4000-a022-000000000011', (select id from public.hunt_reward_grants where reward_id = '00000000-0000-4000-a022-0000000000e1' and profile_id = '00000000-0000-4000-a022-000000000001'), '00000000-0000-4000-a022-0000000000f1', 'key-fh022-r1', 'hash-fh022-redeem-99'))->>'result', 'key_conflict', 'a reused key for another request is a conflict');

-- A voided grant is never redeemed.
select is((public.hunt_reward_void('00000000-0000-4000-a022-000000000011', (select id from public.hunt_reward_grants where reward_id = '00000000-0000-4000-a022-0000000000e1' and profile_id = '00000000-0000-4000-a022-000000000002'), 'issued by mistake', 'key-fh022-v1', 'hash-fh022-void-01'))->>'result', 'voided', 'an unredeemed grant can be voided');
select is((public.hunt_reward_redeem('00000000-0000-4000-a022-000000000012', (select id from public.hunt_reward_grants where reward_id = '00000000-0000-4000-a022-0000000000e1' and profile_id = '00000000-0000-4000-a022-000000000002'), '00000000-0000-4000-a022-0000000000f1', 'key-fh022-r3', 'hash-fh022-redeem-03'))->>'result', 'revoked', 'a voided grant cannot be redeemed');
select is((public.hunt_reward_void('00000000-0000-4000-a022-000000000011', (select id from public.hunt_reward_grants where reward_id = '00000000-0000-4000-a022-0000000000e1' and profile_id = '00000000-0000-4000-a022-000000000002'), 'again please', 'key-fh022-v2', 'hash-fh022-void-02'))->>'result', 'already_voided', 'a second void under a new key says so');
select is((public.hunt_reward_void('00000000-0000-4000-a022-000000000011', (select id from public.hunt_reward_grants where reward_id = '00000000-0000-4000-a022-0000000000e1' and profile_id = '00000000-0000-4000-a022-000000000001'), 'too late', 'key-fh022-v3', 'hash-fh022-void-03'))->>'result', 'already_redeemed', 'a redeemed grant cannot be voided');
select is((public.hunt_reward_void('00000000-0000-4000-a022-000000000011', (select id from public.hunt_reward_grants where reward_id = '00000000-0000-4000-a022-0000000000e2' and profile_id = '00000000-0000-4000-a022-000000000001'), ' ', 'key-fh022-v4', 'hash-fh022-void-04'))->>'result', 'reason_required', 'a void needs a written reason');

-- Expiry and the unknown.
update public.hunt_reward_grants set expires_at = now() - interval '1 minute'
 where reward_id = '00000000-0000-4000-a022-0000000000e2' and profile_id = '00000000-0000-4000-a022-000000000001';
select is((public.hunt_reward_redeem('00000000-0000-4000-a022-000000000011', (select id from public.hunt_reward_grants where reward_id = '00000000-0000-4000-a022-0000000000e2' and profile_id = '00000000-0000-4000-a022-000000000001'), '00000000-0000-4000-a022-0000000000f1', 'key-fh022-r4', 'hash-fh022-redeem-04'))->>'result', 'expired', 'an expired grant is not redeemed');
select is((select state from public.hunt_reward_grants where reward_id = '00000000-0000-4000-a022-0000000000e2' and profile_id = '00000000-0000-4000-a022-000000000001'), 'expired', 'and is marked expired');
select is((public.hunt_reward_redeem('00000000-0000-4000-a022-000000000011', '00000000-0000-4000-a022-0000000000ff', '00000000-0000-4000-a022-0000000000f1', 'key-fh022-r5', 'hash-fh022-redeem-05'))->>'result', 'grant_not_found', 'an unknown grant is not found');

select * from finish();
rollback;
