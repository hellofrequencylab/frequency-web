-- pgTAP guard for migration 20270346086000_hunt_finale_reward_gate.sql (FH-031T).
-- A version that names a finale Event grants its completion reward only to a player that Event admits:
-- a succeeded, unrefunded ticket or a going RSVP the host is not still deciding on, at that Event. No
-- seat, a waitlist place, a refunded ticket and a seat at another Event are each refused, a cancelled
-- Event admits nobody, and a refusal writes nothing (no grant, no count, and not the key, so the same
-- key works once the player has a seat). A version with no finale grants as before.
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.
begin;
select plan(16);

insert into public.profiles (id, display_name, handle) values
  ('00000000-0000-4000-a31d-000000000001', 'FH031T A', 'fh031t-a'),
  ('00000000-0000-4000-a31d-000000000002', 'FH031T B', 'fh031t-b'),
  ('00000000-0000-4000-a31d-000000000003', 'FH031T C', 'fh031t-c'),
  ('00000000-0000-4000-a31d-000000000004', 'FH031T D', 'fh031t-d'),
  ('00000000-0000-4000-a31d-000000000005', 'FH031T E', 'fh031t-e'),
  ('00000000-0000-4000-a31d-000000000006', 'FH031T F', 'fh031t-f');

-- The finale Event and another Event. scope_type 'public' with a scope_id that resolves to nothing is a
-- standalone public Event; host_id stays null so no host trigger has an actor.
insert into public.events (id, title, slug, scope_type, scope_id, visibility, status, starts_at, ends_at, join_mode, is_cancelled)
values
  ('00000000-0000-4000-a31d-0000000000f1', 'FH031T finale', 'fh031t-finale', 'public',
   '00000000-0000-4000-a31d-0000000000ff', 'public', 'published',
   now() + interval '7 days', now() + interval '7 days 2 hours', 'rsvp', false),
  ('00000000-0000-4000-a31d-0000000000f2', 'FH031T elsewhere', 'fh031t-elsewhere', 'public',
   '00000000-0000-4000-a31d-0000000000ff', 'public', 'published',
   now() + interval '7 days', now() + interval '7 days 2 hours', 'rsvp', false);

-- Hunt one ends at the finale Event; Hunt two has no finale.
insert into public.hunts (id, slug, owner_profile_id) values
  ('00000000-0000-4000-a31d-0000000000a1', 'fh031t-finale', '00000000-0000-4000-a31d-000000000001'),
  ('00000000-0000-4000-a31d-0000000000a2', 'fh031t-plain', '00000000-0000-4000-a31d-000000000001');
insert into public.hunt_versions (id, hunt_id, version_no, status, content_hash, published_at, policy) values
  ('00000000-0000-4000-a31d-0000000000b1', '00000000-0000-4000-a31d-0000000000a1', 1, 'published', 'hash-fh031t-1', now(),
   '{"finale":{"event_id":"00000000-0000-4000-a31d-0000000000f1"}}'::jsonb),
  ('00000000-0000-4000-a31d-0000000000b2', '00000000-0000-4000-a31d-0000000000a2', 1, 'published', 'hash-fh031t-2', now(), '{}'::jsonb);
update public.hunts set status = 'live', current_version_id = '00000000-0000-4000-a31d-0000000000b1' where id = '00000000-0000-4000-a31d-0000000000a1';
update public.hunts set status = 'live', current_version_id = '00000000-0000-4000-a31d-0000000000b2' where id = '00000000-0000-4000-a31d-0000000000a2';

-- Every run is finished, so eligibility alone would grant each of them.
insert into public.hunt_runs (id, hunt_id, version_id, subject_profile_id, state, completed_at) values
  ('00000000-0000-4000-a31d-0000000000d1', '00000000-0000-4000-a31d-0000000000a1', '00000000-0000-4000-a31d-0000000000b1', '00000000-0000-4000-a31d-000000000001', 'completed', now()),
  ('00000000-0000-4000-a31d-0000000000d2', '00000000-0000-4000-a31d-0000000000a1', '00000000-0000-4000-a31d-0000000000b1', '00000000-0000-4000-a31d-000000000002', 'completed', now()),
  ('00000000-0000-4000-a31d-0000000000d3', '00000000-0000-4000-a31d-0000000000a1', '00000000-0000-4000-a31d-0000000000b1', '00000000-0000-4000-a31d-000000000003', 'completed', now()),
  ('00000000-0000-4000-a31d-0000000000d4', '00000000-0000-4000-a31d-0000000000a1', '00000000-0000-4000-a31d-0000000000b1', '00000000-0000-4000-a31d-000000000004', 'completed', now()),
  ('00000000-0000-4000-a31d-0000000000d5', '00000000-0000-4000-a31d-0000000000a1', '00000000-0000-4000-a31d-0000000000b1', '00000000-0000-4000-a31d-000000000005', 'completed', now()),
  ('00000000-0000-4000-a31d-0000000000d6', '00000000-0000-4000-a31d-0000000000a1', '00000000-0000-4000-a31d-0000000000b1', '00000000-0000-4000-a31d-000000000006', 'completed', now()),
  ('00000000-0000-4000-a31d-0000000000d7', '00000000-0000-4000-a31d-0000000000a2', '00000000-0000-4000-a31d-0000000000b2', '00000000-0000-4000-a31d-000000000002', 'completed', now());
insert into public.hunt_rewards (id, hunt_id, version_id, reward_key, title) values
  ('00000000-0000-4000-a31d-0000000000e1', '00000000-0000-4000-a31d-0000000000a1', '00000000-0000-4000-a31d-0000000000b1', 'finisher', 'Finisher pin'),
  ('00000000-0000-4000-a31d-0000000000e2', '00000000-0000-4000-a31d-0000000000a1', '00000000-0000-4000-a31d-0000000000b1', 'late', 'Late pin'),
  ('00000000-0000-4000-a31d-0000000000e3', '00000000-0000-4000-a31d-0000000000a2', '00000000-0000-4000-a31d-0000000000b2', 'plain', 'Plain pin');

-- Seats: A has a going RSVP; C is on the waitlist; D's ticket was refunded; E holds a ticket for the
-- other Event only; F holds a succeeded ticket for the finale. B has nothing.
insert into public.event_rsvps (event_id, profile_id, status) values
  ('00000000-0000-4000-a31d-0000000000f1', '00000000-0000-4000-a31d-000000000001', 'going'),
  ('00000000-0000-4000-a31d-0000000000f1', '00000000-0000-4000-a31d-000000000003', 'waitlist');
insert into public.event_tickets (event_id, buyer_profile_id, amount_cents, status, refunded_at) values
  ('00000000-0000-4000-a31d-0000000000f1', '00000000-0000-4000-a31d-000000000004', 2500, 'refunded', now()),
  ('00000000-0000-4000-a31d-0000000000f2', '00000000-0000-4000-a31d-000000000005', 2500, 'succeeded', null),
  ('00000000-0000-4000-a31d-0000000000f1', '00000000-0000-4000-a31d-000000000006', 2500, 'succeeded', null);

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'hunt_reward_grant'
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 'no browser role can execute the grant');

select is((public.hunt_reward_grant('00000000-0000-4000-a31d-000000000001', '00000000-0000-4000-a31d-0000000000d1', 'finisher', 'key-fh031t-01', 'hash-fh031t-01'))->>'result',
  'granted', 'a finisher with a going RSVP at the finale is granted');
select is((public.hunt_reward_grant('00000000-0000-4000-a31d-000000000006', '00000000-0000-4000-a31d-0000000000d6', 'finisher', 'key-fh031t-02', 'hash-fh031t-02'))->>'result',
  'granted', 'a finisher with a succeeded ticket for the finale is granted');

select is((public.hunt_reward_grant('00000000-0000-4000-a31d-000000000002', '00000000-0000-4000-a31d-0000000000d2', 'finisher', 'key-fh031t-03', 'hash-fh031t-03'))::jsonb,
  '{"result":"not_admitted","reason":"no_seat"}'::jsonb, 'a finisher with no seat is not admitted');
select is((public.hunt_reward_grant('00000000-0000-4000-a31d-000000000003', '00000000-0000-4000-a31d-0000000000d3', 'finisher', 'key-fh031t-04', 'hash-fh031t-04'))->>'result',
  'not_admitted', 'a waitlist place is not a seat');
select is((public.hunt_reward_grant('00000000-0000-4000-a31d-000000000004', '00000000-0000-4000-a31d-0000000000d4', 'finisher', 'key-fh031t-05', 'hash-fh031t-05'))->>'result',
  'not_admitted', 'a refunded ticket is not a seat');
select is((public.hunt_reward_grant('00000000-0000-4000-a31d-000000000005', '00000000-0000-4000-a31d-0000000000d5', 'finisher', 'key-fh031t-06', 'hash-fh031t-06'))->>'result',
  'not_admitted', 'a ticket for another Event is not a seat at the finale');

select is((select count(*)::int from public.hunt_reward_grants where reward_id = '00000000-0000-4000-a31d-0000000000e1'), 2, 'only the two seated finishers hold the reward');
select is((select granted_count from public.hunt_rewards where id = '00000000-0000-4000-a31d-0000000000e1'), 2, 'the count moved only for the granted');
select is((select count(*)::int from public.hunt_command_keys where action = 'reward_grant' and idempotency_key = 'key-fh031t-03'), 0, 'a refusal stores no answer under its key');
select is((select count(*)::int from public.hunt_outbox where consumer = 'reward' and semantic_key like 'reward:00000000-0000-4000-a31d-0000000000e1:%'), 2, 'no outbox row for a refusal');

-- Once B holds a seat, the same key grants: the refusal was not remembered.
insert into public.event_rsvps (event_id, profile_id, status) values
  ('00000000-0000-4000-a31d-0000000000f1', '00000000-0000-4000-a31d-000000000002', 'going');
select is((public.hunt_reward_grant('00000000-0000-4000-a31d-000000000002', '00000000-0000-4000-a31d-0000000000d2', 'finisher', 'key-fh031t-03', 'hash-fh031t-03'))->>'result',
  'granted', 'the same key grants once the player has a seat');

-- A Hunt with no finale is unchanged: a finisher with no seat anywhere is granted.
select is((public.hunt_reward_grant('00000000-0000-4000-a31d-000000000002', '00000000-0000-4000-a31d-0000000000d7', 'plain', 'key-fh031t-07', 'hash-fh031t-07'))->>'result',
  'granted', 'a version with no finale grants as before');

-- A cancelled finale Event admits nobody, even a player with a seat.
update public.events set is_cancelled = true where id = '00000000-0000-4000-a31d-0000000000f1';
select is((public.hunt_reward_grant('00000000-0000-4000-a31d-000000000001', '00000000-0000-4000-a31d-0000000000d1', 'late', 'key-fh031t-08', 'hash-fh031t-08'))::jsonb,
  '{"result":"not_admitted","reason":"event_unavailable"}'::jsonb, 'a cancelled finale Event admits nobody');
select is((select count(*)::int from public.hunt_reward_grants where reward_id = '00000000-0000-4000-a31d-0000000000e2'), 0, 'nothing granted at a cancelled finale');

-- An earlier grant is not undone by the gate: it reads seats, it never writes or revokes.
select is((select count(*)::int from public.hunt_reward_grants where reward_id = '00000000-0000-4000-a31d-0000000000e1' and state = 'granted'), 3, 'grants already made stand');

select * from finish();
rollback;
