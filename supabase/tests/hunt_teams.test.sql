-- pgTAP guard for the team half of migration 20270346072000_hunt_teams_editions.sql (FH-043).
-- One session, one transaction. It proves the two "cannot mutate" guarantees at the database (an
-- outsider and a departed member write nothing on a team run, through the door or around it), that
-- two members proving one stop earn one team credit, that the roster locks, that a captain's
-- departure passes the run on with its credits, and that an award is allocated once and the same way.
-- It cannot prove two live sessions race safely; the team row lock and the run row lock carry that,
-- and the FH-006 key (run_id, mission_key) is the backstop.
begin;
select plan(34);

insert into public.profiles (id, display_name, handle) values
  ('00000000-0000-4000-a043-000000000001', 'FH043 Captain', 'fh043-a'),
  ('00000000-0000-4000-a043-000000000002', 'FH043 Second', 'fh043-b'),
  ('00000000-0000-4000-a043-000000000003', 'FH043 Third', 'fh043-c'),
  ('00000000-0000-4000-a043-000000000009', 'FH043 Outsider', 'fh043-x');
insert into public.hunts (id, slug, owner_profile_id) values
  ('00000000-0000-4000-a043-0000000000a1', 'fh043-one', '00000000-0000-4000-a043-000000000001');
insert into public.hunt_versions (id, hunt_id, version_no, status, content_hash, published_at) values
  ('00000000-0000-4000-a043-0000000000b1', '00000000-0000-4000-a043-0000000000a1', 1, 'published', 'hash-fh043', now());
update public.hunts set status = 'live', current_version_id = '00000000-0000-4000-a043-0000000000b1'
 where id = '00000000-0000-4000-a043-0000000000a1';
insert into public.hunt_missions (version_id, hunt_id, mission_key, title, required_assurance) values
  ('00000000-0000-4000-a043-0000000000b1', '00000000-0000-4000-a043-0000000000a1', 'm1', 'One', 'signed_node'),
  ('00000000-0000-4000-a043-0000000000b1', '00000000-0000-4000-a043-0000000000a1', 'm2', 'Two', 'signed_node'),
  ('00000000-0000-4000-a043-0000000000b1', '00000000-0000-4000-a043-0000000000a1', 'm3', 'Three', 'signed_node');
insert into public.hunt_nodes (id, hunt_id) values
  ('00000000-0000-4000-a043-0000000000f1', '00000000-0000-4000-a043-0000000000a1');
insert into public.hunt_placements (id, hunt_id, hunt_node_id, slug, medium) values
  ('00000000-0000-4000-a043-0000000000c1', '00000000-0000-4000-a043-0000000000a1', '00000000-0000-4000-a043-0000000000f1', 'fh043-live', 'qr');
insert into public.hunt_mission_placements (version_id, hunt_id, mission_key, placement_id) values
  ('00000000-0000-4000-a043-0000000000b1', '00000000-0000-4000-a043-0000000000a1', 'm1', '00000000-0000-4000-a043-0000000000c1'),
  ('00000000-0000-4000-a043-0000000000b1', '00000000-0000-4000-a043-0000000000a1', 'm2', '00000000-0000-4000-a043-0000000000c1'),
  ('00000000-0000-4000-a043-0000000000b1', '00000000-0000-4000-a043-0000000000a1', 'm3', '00000000-0000-4000-a043-0000000000c1');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'hunt\_team\_%'
      and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 'no browser role can execute a team command');
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name in ('hunt_teams', 'hunt_team_members', 'hunt_team_awards')
      and grantee in ('anon', 'authenticated', 'PUBLIC')),
  0, 'no browser role holds a grant on a team table');

-- Invite and roster lock.
create temporary table fh043 on commit drop as
  select (public.hunt_team_create('00000000-0000-4000-a043-000000000001', '00000000-0000-4000-a043-0000000000a1',
    'The Lanterns', repeat('a', 64), 3)->>'team_id')::uuid as team;
select ok((select team is not null from fh043), 'a member forms a team on a live Hunt');
select is((public.hunt_team_create('00000000-0000-4000-a043-000000000001', '00000000-0000-4000-a043-0000000000a1', 'Again', repeat('b', 64)))->>'result',
  'already_on_team', 'a member is on one team per Hunt');
select is((public.hunt_team_join('00000000-0000-4000-a043-000000000002', (select team from fh043), repeat('f', 64)))->>'result',
  'bad_invite', 'a wrong invite code does not join');
select is((public.hunt_team_join('00000000-0000-4000-a043-000000000002', (select team from fh043), repeat('a', 64)))->>'result',
  'joined', 'the invite code joins the roster');
select is((public.hunt_team_join('00000000-0000-4000-a043-000000000002', (select team from fh043), repeat('a', 64)))->>'result',
  'already_member', 'joining twice adds no second row');
select is((public.hunt_team_claim_apply('00000000-0000-4000-a043-000000000002', (select team from fh043), 'm1',
    '00000000-0000-4000-a043-0000000000c1', 'ev-early', 'signed_node', 'key-fh043-00', 'hash-fh043-request-00'))->>'result',
  'roster_not_locked', 'nobody credits before the roster locks');
select is((public.hunt_team_lock('00000000-0000-4000-a043-000000000002', (select team from fh043)))->>'result',
  'not_captain', 'only the captain locks the roster');
select is((public.hunt_team_lock('00000000-0000-4000-a043-000000000009', (select team from fh043)))->>'result',
  'not_on_team', 'an outsider cannot lock the roster');
select is((public.hunt_team_join('00000000-0000-4000-a043-000000000003', (select team from fh043), repeat('a', 64)))->>'result',
  'joined', 'a third member joins while the team is forming');
select is((public.hunt_team_lock('00000000-0000-4000-a043-000000000001', (select team from fh043)))->>'result',
  'locked', 'the captain locks the roster');
select is((select count(*)::int from public.hunt_runs r join public.hunt_teams t on t.run_id = r.id where t.id = (select team from fh043)),
  1, 'locking opens one run for the team');
select is((public.hunt_team_join('00000000-0000-4000-a043-000000000009', (select team from fh043), repeat('a', 64)))->>'result',
  'bad_invite', 'the invite code stops working once the roster is locked');
select is((select invite_hash from public.hunt_teams where id = (select team from fh043)), null, 'the invite hash is cleared at lock');

-- Team-scoped progress: one credit per team and stop.
select is((public.hunt_team_claim_apply('00000000-0000-4000-a043-000000000002', (select team from fh043), 'm1',
    '00000000-0000-4000-a043-0000000000c1', 'ev-b', 'signed_node', 'key-fh043-01', 'hash-fh043-request-01'))->>'result',
  'credited', 'a roster member credits the team run');
select is((select actor_profile_id from public.hunt_claims c join public.hunt_teams t on t.run_id = c.run_id where t.id = (select team from fh043) and c.mission_key = 'm1'),
  '00000000-0000-4000-a043-000000000002'::uuid, 'the claim names the member who made it, not the captain');
select is((public.hunt_team_claim_apply('00000000-0000-4000-a043-000000000003', (select team from fh043), 'm1',
    '00000000-0000-4000-a043-0000000000c1', 'ev-c', 'signed_node', 'key-fh043-01', 'hash-fh043-request-02'))->>'result',
  'already_credited', 'a second member proving the same stop earns nothing more');
select is((select count(*)::int from public.hunt_progress p join public.hunt_teams t on t.run_id = p.run_id where t.id = (select team from fh043) and p.mission_key = 'm1'),
  1, 'a duplicate member claim yields one team credit');
select is((select count(*)::int from public.hunt_outbox o join public.hunt_teams t on o.semantic_key = 'credit:' || t.run_id::text || ':m1' where t.id = (select team from fh043)),
  1, 'and one outbox event');
select is((public.hunt_team_claim_apply('00000000-0000-4000-a043-000000000002', (select team from fh043), 'm1',
    '00000000-0000-4000-a043-0000000000c1', 'ev-b', 'signed_node', 'key-fh043-01', 'hash-fh043-request-01'))->>'replayed',
  'true', 'a member retrying their own key replays the stored answer');

-- An outsider cannot mutate the team run, through the door or around it.
select is((public.hunt_team_claim_apply('00000000-0000-4000-a043-000000000009', (select team from fh043), 'm2',
    '00000000-0000-4000-a043-0000000000c1', 'ev-x', 'signed_node', 'key-fh043-02', 'hash-fh043-request-03'))->>'result',
  'not_on_team', 'an outsider is refused at the door');
select is((public.hunt_claim_apply('00000000-0000-4000-a043-000000000009', (select run_id from public.hunt_teams where id = (select team from fh043)), 'm2',
    '00000000-0000-4000-a043-0000000000c1', 'ev-x', 'signed_node', 'key-fh043-03', 'hash-fh043-request-04'))->>'result',
  'run_not_found', 'an outsider cannot claim on the run directly');
select throws_ok(
  $$insert into public.hunt_claims (hunt_id, run_id, version_id, mission_key, actor_profile_id, evidence_id)
    select hunt_id, run_id, version_id, 'm2', '00000000-0000-4000-a043-000000000009', 'ev-raw' from public.hunt_teams where name = 'The Lanterns'$$,
  '42501', null, 'a raw claim row by an outsider is refused by the wall');

-- A departed participant cannot mutate the team run, and the run recovers.
select is((public.hunt_team_leave('00000000-0000-4000-a043-000000000001', (select team from fh043)))->>'captain',
  '00000000-0000-4000-a043-000000000002', 'when the captain leaves, the longest-standing member becomes captain');
select is((select subject_profile_id from public.hunt_runs r join public.hunt_teams t on t.run_id = r.id where t.id = (select team from fh043)),
  '00000000-0000-4000-a043-000000000002'::uuid, 'the run moves to the new captain');
select is((select count(*)::int from public.hunt_progress p join public.hunt_teams t on t.run_id = p.run_id where t.id = (select team from fh043)),
  1, 'the team keeps its credits');
select is((public.hunt_team_claim_apply('00000000-0000-4000-a043-000000000001', (select team from fh043), 'm2',
    '00000000-0000-4000-a043-0000000000c1', 'ev-gone', 'signed_node', 'key-fh043-04', 'hash-fh043-request-05'))->>'result',
  'not_on_team', 'a departed member is refused at the door');
select is((public.hunt_claim_apply('00000000-0000-4000-a043-000000000001', (select run_id from public.hunt_teams where id = (select team from fh043)), 'm2',
    '00000000-0000-4000-a043-0000000000c1', 'ev-gone', 'signed_node', 'key-fh043-05', 'hash-fh043-request-06'))->>'result',
  'run_not_found', 'a departed captain no longer owns the run');
select throws_ok(
  $$insert into public.hunt_claims (hunt_id, run_id, version_id, mission_key, actor_profile_id, evidence_id)
    select hunt_id, run_id, version_id, 'm2', '00000000-0000-4000-a043-000000000001', 'ev-raw-2' from public.hunt_teams where name = 'The Lanterns'$$,
  '42501', null, 'a raw claim row by a departed member is refused by the wall');
select is((select count(*)::int from public.hunt_claims c join public.hunt_teams t on t.run_id = c.run_id where t.id = (select team from fh043)),
  1, 'the refusals wrote no claim');
select is((public.hunt_team_claim_apply('00000000-0000-4000-a043-000000000003', (select team from fh043), 'm2',
    '00000000-0000-4000-a043-0000000000c1', 'ev-c2', 'signed_node', 'key-fh043-06', 'hash-fh043-request-07'))->>'result',
  'credited', 'the remaining members keep playing');

-- Deterministic award allocation: equal shares, the spare unit to the longest-standing member, once.
select is((public.hunt_team_award_allocate('00000000-0000-4000-a043-000000000003', (select team from fh043), 'finish', 5))->'shares',
  '[{"units": 3, "profile_id": "00000000-0000-4000-a043-000000000002"}, {"units": 2, "profile_id": "00000000-0000-4000-a043-000000000003"}]'::jsonb,
  'five units over two members: three to the longest standing, two to the next, none to the departed');
select is((public.hunt_team_award_allocate('00000000-0000-4000-a043-000000000002', (select team from fh043), 'finish', 50))->'shares',
  '[{"units": 3, "profile_id": "00000000-0000-4000-a043-000000000002"}, {"units": 2, "profile_id": "00000000-0000-4000-a043-000000000003"}]'::jsonb,
  'a second allocation of the same award reads the first: one team award');

select * from finish();
rollback;
