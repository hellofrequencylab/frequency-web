-- pgTAP guard for migration 20270346036000_hunt_outbox.sql (FH-009).
-- One session, one transaction: a worker that dies is simulated by moving a lease into the past,
-- and "send succeeded, completion lost" by completing the same event after a second lease. It cannot
-- prove two live workers never share a row; FOR UPDATE SKIP LOCKED is what carries that.
begin;
select plan(21);

insert into public.profiles (id, display_name, handle) values
  ('00000000-0000-4000-a009-000000000001', 'FH009 A', 'fh009-a');
insert into public.hunts (id, slug, owner_profile_id) values
  ('00000000-0000-4000-a009-0000000000a1', 'fh009-one', '00000000-0000-4000-a009-000000000001');
insert into public.hunt_outbox (id, hunt_id, consumer, event_id, event_type, aggregate_kind, aggregate_id, semantic_key, available_at) values
  ('00000000-0000-4000-a009-0000000000e1', '00000000-0000-4000-a009-0000000000a1', 'crm', 'evt-0000001', 'claim.accepted', 'run', 'r1', 'crm:h1:p1:upsert:once', now() - interval '1 hour'),
  ('00000000-0000-4000-a009-0000000000e2', '00000000-0000-4000-a009-0000000000a1', 'crm', 'evt-0000002', 'claim.accepted', 'run', 'r1', 'crm:h1:p1:upsert:once', now() - interval '30 minutes');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'hunt\_outbox\_%'
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 'no browser role can execute any outbox function');

select is((select count(*)::int from public.hunt_outbox_lease('crm', 1, 60)), 1, 'a due row is leased');
select is((select attempts from public.hunt_outbox where id = '00000000-0000-4000-a009-0000000000e1'), 1,
  'the lease counts the attempt');

-- The worker dies: the lease runs out and the same event comes back with a new token.
create temp table fh009_first as
  select lease_token from public.hunt_outbox where id = '00000000-0000-4000-a009-0000000000e1';
update public.hunt_outbox set leased_until = now() - interval '1 second' where id = '00000000-0000-4000-a009-0000000000e1';
select is((select count(*)::int from public.hunt_outbox_lease('crm', 1, 60)), 1, 'an expired lease is handed out again');
select is((select attempts from public.hunt_outbox where id = '00000000-0000-4000-a009-0000000000e1'), 2,
  'the second lease is the second attempt');

select is(public.hunt_outbox_complete('00000000-0000-4000-a009-0000000000e1', (select lease_token from fh009_first), 'p-1'),
  'stale_lease', 'the dead worker cannot complete the row it lost');
select is(public.hunt_outbox_fail('00000000-0000-4000-a009-0000000000e1', (select lease_token from fh009_first), 'late'),
  'stale_lease', 'nor fail it');

-- Provider send succeeded, completion was lost, the retry completes: one receipt.
select is(public.hunt_outbox_complete('00000000-0000-4000-a009-0000000000e1',
  (select lease_token from public.hunt_outbox where id = '00000000-0000-4000-a009-0000000000e1'), 'p-1'),
  'done', 'the current holder completes');
select is(public.hunt_outbox_complete('00000000-0000-4000-a009-0000000000e1', gen_random_uuid(), 'p-1'),
  'already_done', 'completing twice is a no-op');
select is((select count(*)::int from public.hunt_deliveries where consumer = 'crm'), 1, 'one receipt for the effect');

-- The same effect under a second event id: the row closes, the receipt does not double.
select is((select count(*)::int from public.hunt_outbox_lease('crm', 1, 60)), 1, 'the second event is leased');
select is(public.hunt_outbox_complete('00000000-0000-4000-a009-0000000000e2',
  (select lease_token from public.hunt_outbox where id = '00000000-0000-4000-a009-0000000000e2'), 'p-2'),
  'done', 'the second event completes');
select is((select count(*)::int from public.hunt_deliveries where consumer = 'crm'), 1,
  'the shared semantic key keeps it to one receipt');

-- Failure backs off, then dead-letters at the cap.
insert into public.hunt_outbox (id, hunt_id, consumer, event_id, event_type, aggregate_kind, aggregate_id, semantic_key, max_attempts) values
  ('00000000-0000-4000-a009-0000000000e3', '00000000-0000-4000-a009-0000000000a1', 'mail', 'evt-0000003', 'reward.ready', 'run', 'r2', 'mail:h1:p2:reward:once', 2);
select is((select count(*)::int from public.hunt_outbox_lease('mail', 1, 60)), 1, 'first attempt on the capped row');
select is(public.hunt_outbox_fail('00000000-0000-4000-a009-0000000000e3',
  (select lease_token from public.hunt_outbox where id = '00000000-0000-4000-a009-0000000000e3'), 'provider 500'),
  'retry', 'a failure schedules a retry');
update public.hunt_outbox set available_at = now() - interval '1 second' where id = '00000000-0000-4000-a009-0000000000e3';
select is((select count(*)::int from public.hunt_outbox_lease('mail', 1, 60)), 1, 'second attempt');
select is(public.hunt_outbox_fail('00000000-0000-4000-a009-0000000000e3',
  (select lease_token from public.hunt_outbox where id = '00000000-0000-4000-a009-0000000000e3'), 'provider 500'),
  'dead', 'the cap dead-letters the row');

-- Replay: bounded, needs a reason, audited.
select throws_ok($$ select public.hunt_outbox_replay('00000000-0000-4000-a009-0000000000a1', '00000000-0000-4000-a009-000000000001', '', 10) $$,
  '22023', null, 'replay needs a reason');
select is(public.hunt_outbox_replay('00000000-0000-4000-a009-0000000000a1', '00000000-0000-4000-a009-000000000001', 'provider recovered', 10),
  1, 'replay puts the dead row back in the queue');
select is((select status || attempts::text from public.hunt_outbox where id = '00000000-0000-4000-a009-0000000000e3'),
  'pending0', 'with its attempts reset');
select is((select count(*)::int from public.hunt_audit where action = 'outbox_replay'), 1, 'and the replay is audited');

select * from finish();
rollback;
