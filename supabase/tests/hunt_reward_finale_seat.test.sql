-- pgTAP guard for migration 20270346085000_hunt_reward_finale_seat.sql (FH-031S).
-- Proves: on a Hunt that ends at an Event, hunt_reward_grant gives a completion reward only to a player
-- who holds a seat at THAT Event (a going RSVP the host is not still deciding, or a paid ticket that was
-- not refunded). A finished player with no seat at a full Event, a pending request, a refunded ticket
-- and a seat at another Event each answer not_admitted and write nothing, and no ticket or RSVP is ever
-- created by a grant. A cancelled Event, and an Event of a Space that is neither the Hunt's own nor a
-- partner in force, answer not_admitted too. A reward for named missions is untouched by the finale,
-- and the grant stays service_role only. A Hunt with no finale is still proven by hunt_rewards.test.sql,
-- which runs against this definition.
begin;
select plan(20);

insert into public.profiles (id, display_name, handle) values
  ('00000000-0000-4000-a031-000000000001', 'FH031S Rsvp', 'fh031s-rsvp'),
  ('00000000-0000-4000-a031-000000000002', 'FH031S Noseat', 'fh031s-noseat'),
  ('00000000-0000-4000-a031-000000000003', 'FH031S Pending', 'fh031s-pending'),
  ('00000000-0000-4000-a031-000000000004', 'FH031S Ticket', 'fh031s-ticket'),
  ('00000000-0000-4000-a031-000000000005', 'FH031S Refunded', 'fh031s-refunded'),
  ('00000000-0000-4000-a031-000000000006', 'FH031S Elsewhere', 'fh031s-elsewhere'),
  ('00000000-0000-4000-a031-000000000007', 'FH031S Later', 'fh031s-later');
insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');
insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility) values
  ('00000000-0000-4000-a031-0000000000e1', 'fh031s-home', 'FH031S Home', 'business', (select id from public.entities where key = 'labs' limit 1), '00000000-0000-4000-a031-000000000001', 'active', 'network'),
  ('00000000-0000-4000-a031-0000000000e2', 'fh031s-other', 'FH031S Other', 'business', (select id from public.entities where key = 'labs' limit 1), '00000000-0000-4000-a031-000000000001', 'active', 'network');

insert into public.events (id, title, slug, scope_type, scope_id, visibility, status, starts_at, ends_at, join_mode, is_cancelled, host_space_id)
values
  ('00000000-0000-4000-a031-0000000000f1', 'FH031S finale', 'fh031s-finale', 'public', '00000000-0000-4000-a031-0000000000aa', 'public', 'published',
   now() + interval '30 days', now() + interval '30 days 2 hours', 'rsvp', false, '00000000-0000-4000-a031-0000000000e1'),
  ('00000000-0000-4000-a031-0000000000f2', 'FH031S elsewhere', 'fh031s-elsewhere', 'public', '00000000-0000-4000-a031-0000000000aa', 'public', 'published',
   now() + interval '31 days', now() + interval '31 days 2 hours', 'rsvp', false, '00000000-0000-4000-a031-0000000000e1');

-- The Hunt belongs to the home Space and its published version names the finale Event.
insert into public.hunts (id, slug, owner_space_id) values ('00000000-0000-4000-a031-0000000000a1', 'fh031s-one', '00000000-0000-4000-a031-0000000000e1');
insert into public.hunt_versions (id, hunt_id, version_no, status, content_hash, published_at, policy) values
  ('00000000-0000-4000-a031-0000000000b1', '00000000-0000-4000-a031-0000000000a1', 1, 'published', 'hash-fh031s', now(), jsonb_build_object('finale', jsonb_build_object('event_id', '00000000-0000-4000-a031-0000000000f1'::text)));
update public.hunts set status = 'live', current_version_id = '00000000-0000-4000-a031-0000000000b1' where id = '00000000-0000-4000-a031-0000000000a1';
insert into public.hunt_missions (version_id, hunt_id, mission_key, title) values ('00000000-0000-4000-a031-0000000000b1', '00000000-0000-4000-a031-0000000000a1', 'm1', 'One');
insert into public.hunt_runs (id, hunt_id, version_id, subject_profile_id, state, completed_at) values
  ('00000000-0000-4000-a031-0000000000d1', '00000000-0000-4000-a031-0000000000a1', '00000000-0000-4000-a031-0000000000b1', '00000000-0000-4000-a031-000000000001', 'completed', now()),
  ('00000000-0000-4000-a031-0000000000d2', '00000000-0000-4000-a031-0000000000a1', '00000000-0000-4000-a031-0000000000b1', '00000000-0000-4000-a031-000000000002', 'completed', now()),
  ('00000000-0000-4000-a031-0000000000d3', '00000000-0000-4000-a031-0000000000a1', '00000000-0000-4000-a031-0000000000b1', '00000000-0000-4000-a031-000000000003', 'completed', now()),
  ('00000000-0000-4000-a031-0000000000d4', '00000000-0000-4000-a031-0000000000a1', '00000000-0000-4000-a031-0000000000b1', '00000000-0000-4000-a031-000000000004', 'completed', now()),
  ('00000000-0000-4000-a031-0000000000d5', '00000000-0000-4000-a031-0000000000a1', '00000000-0000-4000-a031-0000000000b1', '00000000-0000-4000-a031-000000000005', 'completed', now()),
  ('00000000-0000-4000-a031-0000000000d6', '00000000-0000-4000-a031-0000000000a1', '00000000-0000-4000-a031-0000000000b1', '00000000-0000-4000-a031-000000000006', 'completed', now()),
  ('00000000-0000-4000-a031-0000000000d7', '00000000-0000-4000-a031-0000000000a1', '00000000-0000-4000-a031-0000000000b1', '00000000-0000-4000-a031-000000000007', 'completed', now());
insert into public.hunt_rewards (id, hunt_id, version_id, reward_key, title, stock) values
  ('00000000-0000-4000-a031-0000000000c1', '00000000-0000-4000-a031-0000000000a1', '00000000-0000-4000-a031-0000000000b1', 'finisher', 'Finisher', null);
insert into public.hunt_rewards (id, hunt_id, version_id, reward_key, title, stock, eligibility) values
  ('00000000-0000-4000-a031-0000000000c2', '00000000-0000-4000-a031-0000000000a1', '00000000-0000-4000-a031-0000000000b1', 'stop-one', 'Stop one', null, '{"missions":["m1"]}');

-- Seats, as the Events tables hold them. Nothing below is written by the Hunt.
insert into public.event_rsvps (event_id, profile_id, status, approval_status) values
  ('00000000-0000-4000-a031-0000000000f1', '00000000-0000-4000-a031-000000000001', 'going', 'none'),
  ('00000000-0000-4000-a031-0000000000f1', '00000000-0000-4000-a031-000000000003', 'going', 'pending'),
  ('00000000-0000-4000-a031-0000000000f1', '00000000-0000-4000-a031-000000000007', 'going', 'none'),
  ('00000000-0000-4000-a031-0000000000f2', '00000000-0000-4000-a031-000000000006', 'going', 'none');
insert into public.event_tickets (event_id, buyer_profile_id, amount_cents, status) values
  ('00000000-0000-4000-a031-0000000000f1', '00000000-0000-4000-a031-000000000004', 2500, 'succeeded'),
  ('00000000-0000-4000-a031-0000000000f1', '00000000-0000-4000-a031-000000000005', 2500, 'succeeded');
update public.event_tickets set refunded_at = now() where event_id = '00000000-0000-4000-a031-0000000000f1' and buyer_profile_id = '00000000-0000-4000-a031-000000000005';
-- The Event is now full: its capacity is exactly the seats already taken.
update public.events set capacity = 3 where id = '00000000-0000-4000-a031-0000000000f1';

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'hunt_reward_grant'
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 'no browser role can execute the grant');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'hunt_reward_grant'),
  1, 'there is still one grant function, with the same signature');

-- Full Event, no seat: the finished player gets nothing, and holds no RSVP, ticket or reward afterwards.
select is((public.hunt_reward_grant('00000000-0000-4000-a031-000000000002', '00000000-0000-4000-a031-0000000000d2', 'finisher', 'key-fh031s-01', 'hash-fh031s-request-01'))->>'result', 'not_admitted', 'a finished player with no seat at a full Event is not granted the completion reward');
select is((public.hunt_reward_grant('00000000-0000-4000-a031-000000000002', '00000000-0000-4000-a031-0000000000d2', 'finisher', 'key-fh031s-02', 'hash-fh031s-request-02'))->>'reason', 'no_seat', 'the reason is that they hold no seat');
select is((select count(*)::int from public.hunt_reward_grants where profile_id = '00000000-0000-4000-a031-000000000002'), 0, 'no reward was granted');
select is((select granted_count from public.hunt_rewards where reward_key = 'finisher'), 0, 'the stock count did not move');
select is(
  (select count(*)::int from public.event_rsvps where profile_id = '00000000-0000-4000-a031-000000000002') + (select count(*)::int from public.event_tickets where buyer_profile_id = '00000000-0000-4000-a031-000000000002'),
  0, 'and the refusal created no RSVP and no ticket');
select is((select count(*)::int from public.hunt_command_keys where actor_profile_id = '00000000-0000-4000-a031-000000000002' and action = 'reward_grant'), 0, 'a refusal stores no command key, so a later seat can still be granted');

select is((public.hunt_reward_grant('00000000-0000-4000-a031-000000000003', '00000000-0000-4000-a031-0000000000d3', 'finisher', 'key-fh031s-03', 'hash-fh031s-request-03'))->>'result', 'not_admitted', 'a request the host has not answered is not a seat');
select is((public.hunt_reward_grant('00000000-0000-4000-a031-000000000005', '00000000-0000-4000-a031-0000000000d5', 'finisher', 'key-fh031s-04', 'hash-fh031s-request-04'))->>'result', 'not_admitted', 'a refunded ticket is not a seat');
select is((public.hunt_reward_grant('00000000-0000-4000-a031-000000000006', '00000000-0000-4000-a031-0000000000d6', 'finisher', 'key-fh031s-05', 'hash-fh031s-request-05'))->>'result', 'not_admitted', 'a seat at another Event is not a seat at the finale');

-- The Event admits these two, so the Hunt may reward them.
select is((public.hunt_reward_grant('00000000-0000-4000-a031-000000000001', '00000000-0000-4000-a031-0000000000d1', 'finisher', 'key-fh031s-06', 'hash-fh031s-request-06'))->>'result', 'granted', 'a finished player with a going RSVP is granted');
select is((public.hunt_reward_grant('00000000-0000-4000-a031-000000000004', '00000000-0000-4000-a031-0000000000d4', 'finisher', 'key-fh031s-07', 'hash-fh031s-request-07'))->>'result', 'granted', 'a finished player with a paid ticket is granted');
select is(
  (select count(*)::int from public.event_rsvps where event_id = '00000000-0000-4000-a031-0000000000f1') + (select count(*)::int from public.event_tickets where event_id = '00000000-0000-4000-a031-0000000000f1'),
  5, 'the grants left the Event''s RSVPs and tickets exactly as they were');

-- A reward for named missions does not wait on the finale.
insert into public.hunt_claims (id, hunt_id, run_id, version_id, mission_key, actor_profile_id, evidence_id, state)
  values ('00000000-0000-4000-a031-0000000000ab', '00000000-0000-4000-a031-0000000000a1', '00000000-0000-4000-a031-0000000000d2', '00000000-0000-4000-a031-0000000000b1', 'm1', '00000000-0000-4000-a031-000000000002', 'ev-fh031s-1', 'accepted');
insert into public.hunt_progress (run_id, mission_key, hunt_id, version_id, credited_claim_id)
  values ('00000000-0000-4000-a031-0000000000d2', 'm1', '00000000-0000-4000-a031-0000000000a1', '00000000-0000-4000-a031-0000000000b1', '00000000-0000-4000-a031-0000000000ab');
select is((public.hunt_reward_grant('00000000-0000-4000-a031-000000000002', '00000000-0000-4000-a031-0000000000d2', 'stop-one', 'key-fh031s-08', 'hash-fh031s-request-08'))->>'result', 'granted', 'a reward for named missions is granted with no seat at the finale');

-- The Event itself: cancelled, or hosted by a Space that is not the Hunt's to end at.
update public.events set is_cancelled = true where id = '00000000-0000-4000-a031-0000000000f1';
select is((public.hunt_reward_grant('00000000-0000-4000-a031-000000000007', '00000000-0000-4000-a031-0000000000d7', 'finisher', 'key-fh031s-09', 'hash-fh031s-request-09'))->>'reason', 'event_unavailable', 'a cancelled Event has no finale, even for a player with a seat');
update public.events set is_cancelled = false, host_space_id = '00000000-0000-4000-a031-0000000000e2' where id = '00000000-0000-4000-a031-0000000000f1';
select is((public.hunt_reward_grant('00000000-0000-4000-a031-000000000007', '00000000-0000-4000-a031-0000000000d7', 'finisher', 'key-fh031s-10', 'hash-fh031s-request-10'))->>'reason', 'event_unavailable', 'an Event of a Space that is not a partner is not the Hunt''s to end at');
insert into public.hunt_partners (hunt_id, space_id, status, effective_at) values ('00000000-0000-4000-a031-0000000000a1', '00000000-0000-4000-a031-0000000000e2', 'withdrawn', now() - interval '1 day');
select is((public.hunt_reward_grant('00000000-0000-4000-a031-000000000007', '00000000-0000-4000-a031-0000000000d7', 'finisher', 'key-fh031s-11', 'hash-fh031s-request-11'))->>'reason', 'event_unavailable', 'a partner that withdrew is not in force');
update public.hunt_partners set status = 'accepted', revoked_at = null where hunt_id = '00000000-0000-4000-a031-0000000000a1' and space_id = '00000000-0000-4000-a031-0000000000e2';
select is((public.hunt_reward_grant('00000000-0000-4000-a031-000000000007', '00000000-0000-4000-a031-0000000000d7', 'finisher', 'key-fh031s-12', 'hash-fh031s-request-12'))->>'result', 'granted', 'a partner in force hosts the finale, and the seated player is granted');
select is((select granted_count from public.hunt_rewards where reward_key = 'finisher'), 3, 'three completion rewards were granted, one for each admitted player');

select * from finish();
rollback;
