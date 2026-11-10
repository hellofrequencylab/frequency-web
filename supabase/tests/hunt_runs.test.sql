-- pgTAP guard for migration 20270346032000_hunt_runs.sql (FH-006).
-- One session, one transaction: it proves the KEYS refuse a second credit and a replayed command
-- on the sequential path. It cannot prove two concurrent sessions race safely; the claim RPC (FH-010)
-- takes the run lock and needs its own concurrent test.
begin;
select plan(9);

insert into public.profiles (id, display_name, handle) values
  ('00000000-0000-4000-a006-000000000001', 'FH006 A', 'fh006-a'),
  ('00000000-0000-4000-a006-000000000002', 'FH006 B', 'fh006-b');
insert into public.hunts (id, slug, owner_profile_id) values
  ('00000000-0000-4000-a006-0000000000a1', 'fh006-one', '00000000-0000-4000-a006-000000000001'),
  ('00000000-0000-4000-a006-0000000000a2', 'fh006-two', '00000000-0000-4000-a006-000000000001');
insert into public.hunt_versions (id, hunt_id, version_no) values
  ('00000000-0000-4000-a006-0000000000b1', '00000000-0000-4000-a006-0000000000a1', 1),
  ('00000000-0000-4000-a006-0000000000b2', '00000000-0000-4000-a006-0000000000a2', 1);
insert into public.hunt_missions (version_id, hunt_id, mission_key, title) values
  ('00000000-0000-4000-a006-0000000000b1', '00000000-0000-4000-a006-0000000000a1', 'shop-a', 'Shop A');
insert into public.hunt_runs (id, hunt_id, version_id, subject_profile_id) values
  ('00000000-0000-4000-a006-0000000000c1', '00000000-0000-4000-a006-0000000000a1',
   '00000000-0000-4000-a006-0000000000b1', '00000000-0000-4000-a006-000000000001');
insert into public.hunt_claims (id, hunt_id, run_id, version_id, mission_key, actor_profile_id, evidence_id) values
  ('00000000-0000-4000-a006-0000000000d1', '00000000-0000-4000-a006-0000000000a1',
   '00000000-0000-4000-a006-0000000000c1', '00000000-0000-4000-a006-0000000000b1', 'shop-a',
   '00000000-0000-4000-a006-000000000001', 'ev-1');

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated')
      and table_name in ('hunt_runs','hunt_claims','hunt_progress','hunt_command_keys','hunt_audit','hunt_compensations')),
  0, 'the browser roles hold no grant on any FH-006 table');

insert into public.hunt_progress (run_id, mission_key, hunt_id, version_id, credited_claim_id) values
  ('00000000-0000-4000-a006-0000000000c1', 'shop-a', '00000000-0000-4000-a006-0000000000a1',
   '00000000-0000-4000-a006-0000000000b1', '00000000-0000-4000-a006-0000000000d1');
select is((select count(*)::int from public.hunt_progress where run_id = '00000000-0000-4000-a006-0000000000c1'),
  1, 'a claim earns one credit');

select throws_ok($$ insert into public.hunt_progress (run_id, mission_key, hunt_id, version_id, credited_claim_id) values
  ('00000000-0000-4000-a006-0000000000c1', 'shop-a', '00000000-0000-4000-a006-0000000000a1',
   '00000000-0000-4000-a006-0000000000b1', '00000000-0000-4000-a006-0000000000d1') $$,
  '23505', null, 'a second credit for the same run and mission is refused');

select throws_ok($$ insert into public.hunt_claims (hunt_id, run_id, version_id, mission_key, actor_profile_id, evidence_id) values
  ('00000000-0000-4000-a006-0000000000a1', '00000000-0000-4000-a006-0000000000c1',
   '00000000-0000-4000-a006-0000000000b1', 'shop-a', '00000000-0000-4000-a006-000000000001', 'ev-1') $$,
  '23505', null, 'a replayed proof adds no second claim row');

select throws_ok($$ insert into public.hunt_runs (hunt_id, version_id, subject_profile_id) values
  ('00000000-0000-4000-a006-0000000000a1', '00000000-0000-4000-a006-0000000000b2',
   '00000000-0000-4000-a006-000000000002') $$,
  '23503', null, 'a run cannot pair a version with another Hunt');

select throws_ok($$ insert into public.hunt_runs (hunt_id, version_id, subject_profile_id, state) values
  ('00000000-0000-4000-a006-0000000000a1', '00000000-0000-4000-a006-0000000000b1',
   '00000000-0000-4000-a006-000000000002', 'completed') $$,
  '23514', null, 'a completed run needs completed_at');

insert into public.hunt_command_keys (actor_profile_id, action, idempotency_key, request_hash) values
  ('00000000-0000-4000-a006-000000000001', 'claim', 'key-00000001', 'hash-aaaaaaaaaaaaaaaa');
select throws_ok($$ insert into public.hunt_command_keys (actor_profile_id, action, idempotency_key, request_hash) values
  ('00000000-0000-4000-a006-000000000001', 'claim', 'key-00000001', 'hash-bbbbbbbbbbbbbbbb') $$,
  '23505', null, 'a reused key with another payload collides, so the writer can answer conflict');
select is((select request_hash from public.hunt_command_keys where idempotency_key = 'key-00000001'),
  'hash-aaaaaaaaaaaaaaaa', 'the first request hash is the one kept');

select throws_ok($$ insert into public.hunt_compensations (hunt_id, run_id, claim_id, reason) values
  ('00000000-0000-4000-a006-0000000000a2', '00000000-0000-4000-a006-0000000000c1',
   '00000000-0000-4000-a006-0000000000d1', 'wrong hunt') $$,
  '23503', null, 'a compensation cannot name another Hunt');

select * from finish();
rollback;
