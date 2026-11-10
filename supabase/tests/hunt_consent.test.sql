-- pgTAP guard for migration 20270346040000_hunt_consent.sql (FH-024).
-- One session, one transaction. It proves the ledger is append-only, that a withdrawal stops a send and a
-- replay or stale event cannot re-subscribe, that one Space never sees another's consent, that a global
-- suppression from a privacy request outranks any grant, that essential messages are checked apart from
-- marketing consent, and that erasure leaves a hash-only tombstone.
begin;
select plan(33);

insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');
insert into public.profiles (id, display_name, handle) values
  ('00000000-0000-4000-a024-000000000001', 'FH024 P', 'fh024-p'),
  ('00000000-0000-4000-a024-000000000002', 'FH024 Q', 'fh024-q'),
  ('00000000-0000-4000-a024-000000000003', 'FH024 R', 'fh024-r');
insert into public.spaces (id, slug, name, type, entity_id, status, visibility) values
  ('00000000-0000-4000-a024-0000000000e1', 'fh024-a', 'FH024 A', 'business', (select id from public.entities where key = 'labs' limit 1), 'active', 'network'),
  ('00000000-0000-4000-a024-0000000000e2', 'fh024-b', 'FH024 B', 'business', (select id from public.entities where key = 'labs' limit 1), 'active', 'network');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('hunt_consent_record', 'hunt_consent_can_send', 'hunt_consent_roster', 'hunt_privacy_request', 'hunt_consent_events_guard')
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 'no browser role can execute any consent function');

-- A grant to Space A only.
select is((public.hunt_consent_record('00000000-0000-4000-a024-000000000001', '00000000-0000-4000-a024-0000000000e1', 'grant', 'v1', 'hunt_reward', null, 'evt-fh024-0001', now() - interval '3 hours'))->>'result',
  'recorded', 'an opt-in is recorded for the named Space');
select is((select count(*)::int from public.hunt_consent_roster('00000000-0000-4000-a024-0000000000e1')), 1, 'Space A sees its opted-in lead');
select is((select count(*)::int from public.hunt_consent_roster('00000000-0000-4000-a024-0000000000e2')), 0, 'Space B sees nothing of A''s consent');
select is((public.hunt_consent_can_send('00000000-0000-4000-a024-000000000001', '00000000-0000-4000-a024-0000000000e1'))->>'allowed', 'true', 'marketing may go to A');
select is((public.hunt_consent_can_send('00000000-0000-4000-a024-000000000001', '00000000-0000-4000-a024-0000000000e2'))->>'reason', 'no_consent', 'B has no consent from this player');
select is((public.hunt_consent_record('00000000-0000-4000-a024-000000000001', '00000000-0000-4000-a024-0000000000e1', 'grant', 'v1', 'hunt_reward', null, 'evt-fh024-0001', now() - interval '3 hours'))->>'result',
  'replayed', 'the same event key is a replay and writes nothing');
select is((select count(*)::int from public.hunt_consent_events where event_key = 'evt-fh024-0001'), 1, 'one ledger row');

-- A second merchant's choice is its own record; withdrawing from A leaves B alone.
select is((public.hunt_consent_record('00000000-0000-4000-a024-000000000001', '00000000-0000-4000-a024-0000000000e2', 'grant', 'v1', 'follow_link', null, 'evt-fh024-0002', now() - interval '2 hours'))->>'result',
  'recorded', 'B''s opt-in is a separate record');
select is((public.hunt_consent_record('00000000-0000-4000-a024-000000000001', '00000000-0000-4000-a024-0000000000e1', 'withdraw', 'v1', 'player_area', null, 'evt-fh024-0003', now() - interval '1 hour'))->>'result',
  'recorded', 'a withdrawal from A is recorded');
select is((public.hunt_consent_can_send('00000000-0000-4000-a024-000000000001', '00000000-0000-4000-a024-0000000000e1'))->>'reason', 'space_suppression', 'A may no longer send');
select is((public.hunt_consent_can_send('00000000-0000-4000-a024-000000000001', '00000000-0000-4000-a024-0000000000e2'))->>'allowed', 'true', 'B still may');
select is((select count(*)::int from public.hunt_consent_roster('00000000-0000-4000-a024-0000000000e1')), 0, 'A''s roster drops the lead');
select is((select state from public.hunt_leads where space_id = '00000000-0000-4000-a024-0000000000e1' and profile_id = '00000000-0000-4000-a024-000000000001'), 'withdrawn', 'A''s lead reads withdrawn');

-- Replay and stale events cannot re-subscribe.
select is((public.hunt_consent_record('00000000-0000-4000-a024-000000000001', '00000000-0000-4000-a024-0000000000e1', 'grant', 'v1', 'hunt_reward', null, 'evt-fh024-0001', now() - interval '3 hours'))->>'result',
  'replayed', 'replaying the old opt-in after the opt-out does nothing');
select is((public.hunt_consent_record('00000000-0000-4000-a024-000000000001', '00000000-0000-4000-a024-0000000000e1', 'grant', 'v1', 'hunt_reward', null, 'evt-fh024-0004', now() - interval '2 hours'))->>'result',
  'stale', 'an older opt-in under a new key is refused as stale');
select is((public.hunt_consent_can_send('00000000-0000-4000-a024-000000000001', '00000000-0000-4000-a024-0000000000e1'))->>'allowed', 'false', 'still no send after the replay attempts');

-- The ledger is append-only.
select throws_ok($$update public.hunt_consent_events set event = 'grant' where event_key = 'evt-fh024-0003'$$, '55000', 'the consent ledger is append-only', 'a ledger row cannot be edited');
select throws_ok($$delete from public.hunt_consent_events where event_key = 'evt-fh024-0003'$$, '55000', 'the consent ledger is append-only', 'nor deleted directly');

-- A newer, deliberate grant re-subscribes.
select is((public.hunt_consent_record('00000000-0000-4000-a024-000000000001', '00000000-0000-4000-a024-0000000000e1', 'grant', 'v2', 'player_area', null, 'evt-fh024-0005', now()))->>'result',
  'recorded', 'a newer deliberate opt-in is recorded');
select is((public.hunt_consent_can_send('00000000-0000-4000-a024-000000000001', '00000000-0000-4000-a024-0000000000e1'))->>'allowed', 'true', 'and then A may send again');

-- Essential messages are checked apart from marketing consent.
select is((public.hunt_consent_can_send('00000000-0000-4000-a024-000000000002', '00000000-0000-4000-a024-0000000000e1', true))->>'allowed', 'true', 'an essential message needs no marketing consent');
select is((public.hunt_consent_can_send('00000000-0000-4000-a024-000000000002', '00000000-0000-4000-a024-0000000000e1', false))->>'allowed', 'false', 'a marketing one does');

-- Do not contact: global, outranks any grant, covers essential too.
select is((public.hunt_privacy_request('00000000-0000-4000-a024-000000000001', 'do_not_contact', 'req-fh024-0001', repeat('a', 64)))->>'result', 'recorded', 'a do-not-contact request is recorded');
select is((public.hunt_consent_can_send('00000000-0000-4000-a024-000000000001', '00000000-0000-4000-a024-0000000000e2', true))->>'reason', 'global_suppression', 'it stops even essential mail');
select is((public.hunt_consent_record('00000000-0000-4000-a024-000000000001', '00000000-0000-4000-a024-0000000000e2', 'grant', 'v2', 'player_area', null, 'evt-fh024-0006', now() + interval '1 minute'))->>'result',
  'suppressed', 'no grant can lift a global suppression');
select is((select count(*)::int from public.hunt_consent_roster('00000000-0000-4000-a024-0000000000e1')), 0, 'the roster drops a globally suppressed lead');
select is((public.hunt_privacy_request('00000000-0000-4000-a024-000000000001', 'do_not_contact', 'req-fh024-0001', repeat('a', 64)))->>'result', 'replayed', 'the same request key is a replay');

-- Erasure: ledger and leads go, the hash-only tombstone stays, and account deletion still works.
select is((public.hunt_consent_record('00000000-0000-4000-a024-000000000003', '00000000-0000-4000-a024-0000000000e1', 'grant', 'v1', 'hunt_reward', null, 'evt-fh024-0007', now()))->>'result', 'recorded', 'R opts in');
select is((public.hunt_privacy_request('00000000-0000-4000-a024-000000000003', 'erase', 'req-fh024-0002', repeat('b', 64)))->>'result', 'recorded', 'R asks to be erased');
select is((select count(*)::int from public.hunt_consent_events where profile_id = '00000000-0000-4000-a024-000000000003')
        + (select count(*)::int from public.hunt_leads where profile_id = '00000000-0000-4000-a024-000000000003'), 0, 'R''s ledger rows and leads are gone');
select is((public.hunt_consent_can_send('00000000-0000-4000-a024-000000000002', '00000000-0000-4000-a024-0000000000e1', false, repeat('b', 64)))->>'reason', 'global_suppression',
  'the tombstone still blocks that contact under any account');

-- Deleting an account that still has ledger rows cascades through the append-only guard.
delete from public.profiles where id = '00000000-0000-4000-a024-000000000001';
select is((select count(*)::int from public.hunt_consent_events where profile_id = '00000000-0000-4000-a024-000000000001'), 0, 'the account delete took its ledger rows with it');

select * from finish();
rollback;
