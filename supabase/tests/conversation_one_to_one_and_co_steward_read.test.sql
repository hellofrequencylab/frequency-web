-- HYG-139 (ADR-1692), migration 20270345011600_conversation_one_to_one_and_co_steward_read.sql.
--
-- Two follow-ups that migration comments promised and nothing shipped, proven against a real
-- database with the migrations applied:
--
--   1. CONVERSATIONS ARE ONE-TO-ONE. Two participants land; a third is refused, whether it comes
--      alone, inside a three-row insert, or as an update that moves someone in. The same person
--      twice is refused by the primary key. A conversation that moved to a room takes no new
--      participant. The writes the app does make still work: a read marker on a full thread, a
--      participant re-pointed inside their own thread, and leaving.
--   2. SCOPE LEADERS READ THEIR CO-STEWARDS, AND NOTHING ELSE. A leader by edge reads every edge
--      on the scope they lead (the suspended one included) and none on another scope; a leader by
--      the circle's host column reads the edges on that circle; a suspended steward, a member with
--      no edge and anon read only what they read before (their own row, or nothing); staff read
--      everything. The policy is read only: a leader writes nothing.
--
-- One transaction, rolled back: nothing persists. The trigger half runs as postgres, which is how
-- every writer reaches conversation_participants (the service role); triggers fire for every role.
-- Fixture style follows space_plan_comments.test.sql, including the auto-provisioned-profile
-- cleanup and the fixture-table grants (a fresh local stack lacks the hosted platform's default
-- grants; the POLICIES are what this file tests, not the grant baseline).

begin;
select plan(31);

-- ── Fixture (seeded as postgres, which RLS does not bind) ────────────────────────────────────────
-- Seats: 1 A, 2 B, 3 C members with no edge; 4 L leads circle X by a host edge; 5 K crews circle
-- X; 6 S holds a SUSPENDED edge on circle X; 7 O leads circle Y; 8 H hosts circle Z by the leader
-- column only (no edge); 9 E crews circle Z; 10 T is platform staff.

insert into auth.users (id, email) values
  ('00000000-0000-4000-a139-000000000001', 'h139-a@test.local'),
  ('00000000-0000-4000-a139-000000000002', 'h139-b@test.local'),
  ('00000000-0000-4000-a139-000000000003', 'h139-c@test.local'),
  ('00000000-0000-4000-a139-000000000004', 'h139-l@test.local'),
  ('00000000-0000-4000-a139-000000000005', 'h139-k@test.local'),
  ('00000000-0000-4000-a139-000000000006', 'h139-s@test.local'),
  ('00000000-0000-4000-a139-000000000007', 'h139-o@test.local'),
  ('00000000-0000-4000-a139-000000000008', 'h139-h@test.local'),
  ('00000000-0000-4000-a139-000000000009', 'h139-e@test.local'),
  ('00000000-0000-4000-a139-000000000010', 'h139-t@test.local');

insert into public.profiles (id, auth_user_id, display_name, handle) values
  ('00000000-0000-4000-b139-000000000001', '00000000-0000-4000-a139-000000000001', 'H139 A', 'h139-a'),
  ('00000000-0000-4000-b139-000000000002', '00000000-0000-4000-a139-000000000002', 'H139 B', 'h139-b'),
  ('00000000-0000-4000-b139-000000000003', '00000000-0000-4000-a139-000000000003', 'H139 C', 'h139-c'),
  ('00000000-0000-4000-b139-000000000004', '00000000-0000-4000-a139-000000000004', 'H139 L', 'h139-l'),
  ('00000000-0000-4000-b139-000000000005', '00000000-0000-4000-a139-000000000005', 'H139 K', 'h139-k'),
  ('00000000-0000-4000-b139-000000000006', '00000000-0000-4000-a139-000000000006', 'H139 S', 'h139-s'),
  ('00000000-0000-4000-b139-000000000007', '00000000-0000-4000-a139-000000000007', 'H139 O', 'h139-o'),
  ('00000000-0000-4000-b139-000000000008', '00000000-0000-4000-a139-000000000008', 'H139 H', 'h139-h'),
  ('00000000-0000-4000-b139-000000000009', '00000000-0000-4000-a139-000000000009', 'H139 E', 'h139-e'),
  ('00000000-0000-4000-b139-000000000010', '00000000-0000-4000-a139-000000000010', 'H139 T', 'h139-t');

-- trg_on_auth_user_created auto-provisions a profile per auth.users row, so each seeded user has
-- TWO profiles and get_my_web_role()'s scalar subquery would error. Keep only the fixed ids.
delete from public.profiles
where auth_user_id::text like '00000000-0000-4000-a139-%'
  and id::text not like '00000000-0000-4000-b139-%';

update public.profiles set web_role = 'janitor'
 where id = '00000000-0000-4000-b139-000000000010';

-- Circle Z exists so its host column can be read; X and Y need no row (scope_id is polymorphic).
insert into public.circles (id, name, slug, type, status, unlisted, access, host_id) values
  ('00000000-0000-4000-e139-00000000000c', 'H139 Zed', 'h139-zed', 'online', 'active', false, 'open',
   '00000000-0000-4000-b139-000000000008');

insert into public.stewardships (id, profile_id, role, scope_type, scope_id, state) values
  ('00000000-0000-4000-d139-000000000001', '00000000-0000-4000-b139-000000000004', 'host', 'circle',
   '00000000-0000-4000-e139-00000000000a', 'active'),
  ('00000000-0000-4000-d139-000000000002', '00000000-0000-4000-b139-000000000005', 'crew', 'circle',
   '00000000-0000-4000-e139-00000000000a', 'active'),
  ('00000000-0000-4000-d139-000000000003', '00000000-0000-4000-b139-000000000006', 'crew', 'circle',
   '00000000-0000-4000-e139-00000000000a', 'suspended'),
  ('00000000-0000-4000-d139-000000000004', '00000000-0000-4000-b139-000000000007', 'host', 'circle',
   '00000000-0000-4000-e139-00000000000b', 'active'),
  ('00000000-0000-4000-d139-000000000005', '00000000-0000-4000-b139-000000000009', 'crew', 'circle',
   '00000000-0000-4000-e139-00000000000c', 'active');

-- A room for the migrated conversation to point at.
insert into public.rooms (id, name, visibility, creator_id) values
  ('00000000-0000-4000-f139-000000000001', 'H139 Room', 'private', '00000000-0000-4000-b139-000000000001');

insert into public.conversations (id) values
  ('00000000-0000-4000-c139-000000000001'),
  ('00000000-0000-4000-c139-000000000002'),
  ('00000000-0000-4000-c139-000000000003');
insert into public.conversations (id, migrated_to_room_id) values
  ('00000000-0000-4000-c139-000000000004', '00000000-0000-4000-f139-000000000001');

-- The fixture grants (see the header). stewardships is granted to anon as well, so the anon
-- seat below is refused by the POLICY and not by a grant the local stack never had.
grant select on public.profiles to anon, authenticated;
grant select, insert, update, delete on public.stewardships to anon, authenticated;

-- ── 1. The trigger is attached ───────────────────────────────────────────────────────────────────

select is(
  (select count(*)::int from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'conversation_participants'
      and t.tgname = 'conversation_participants_one_to_one' and not t.tgisinternal),
  1,
  'conversation_participants_one_to_one is attached');

-- ── 2. Two land, a third does not ────────────────────────────────────────────────────────────────

select lives_ok(
  $$ insert into public.conversation_participants (conversation_id, profile_id) values
       ('00000000-0000-4000-c139-000000000001', '00000000-0000-4000-b139-000000000001'),
       ('00000000-0000-4000-c139-000000000001', '00000000-0000-4000-b139-000000000002') $$,
  'a conversation lands its two participants in one insert, as every app writer does');

select throws_ok(
  $$ insert into public.conversation_participants (conversation_id, profile_id) values
       ('00000000-0000-4000-c139-000000000001', '00000000-0000-4000-b139-000000000003') $$,
  '23514',
  'conversation_is_one_to_one',
  'a third participant is refused');

select throws_ok(
  $$ insert into public.conversation_participants (conversation_id, profile_id) values
       ('00000000-0000-4000-c139-000000000001', '00000000-0000-4000-b139-000000000001') $$,
  '23505',
  null,
  'the same person twice in one conversation is refused by the primary key');

select throws_ok(
  $$ insert into public.conversation_participants (conversation_id, profile_id) values
       ('00000000-0000-4000-c139-000000000002', '00000000-0000-4000-b139-000000000001'),
       ('00000000-0000-4000-c139-000000000002', '00000000-0000-4000-b139-000000000002'),
       ('00000000-0000-4000-c139-000000000002', '00000000-0000-4000-b139-000000000003') $$,
  '23514',
  'conversation_is_one_to_one',
  'a three-row insert is refused at its third row');

select is(
  (select count(*)::int from public.conversation_participants
    where conversation_id = '00000000-0000-4000-c139-000000000002'),
  0,
  'and the refused statement lands nobody, not even its first two rows');

-- ── 3. Updates: moving someone into a full thread is refused; the app's own writes are not ──────

insert into public.conversation_participants (conversation_id, profile_id) values
  ('00000000-0000-4000-c139-000000000003', '00000000-0000-4000-b139-000000000003'),
  ('00000000-0000-4000-c139-000000000003', '00000000-0000-4000-b139-000000000001');

select throws_ok(
  $$ update public.conversation_participants
        set conversation_id = '00000000-0000-4000-c139-000000000001'
      where conversation_id = '00000000-0000-4000-c139-000000000003'
        and profile_id = '00000000-0000-4000-b139-000000000003' $$,
  '23514',
  'conversation_is_one_to_one',
  'an update that moves a participant into a full conversation is refused');

select lives_ok(
  $$ update public.conversation_participants set last_read_at = now()
      where conversation_id = '00000000-0000-4000-c139-000000000001' $$,
  'the read marker still writes on a full conversation');

select lives_ok(
  $$ update public.conversation_participants
        set profile_id = '00000000-0000-4000-b139-000000000004'
      where conversation_id = '00000000-0000-4000-c139-000000000001'
        and profile_id = '00000000-0000-4000-b139-000000000002' $$,
  'a participant re-pointed inside their own conversation (a profile merge) is not counted twice');

select lives_ok(
  $$ delete from public.conversation_participants
      where conversation_id = '00000000-0000-4000-c139-000000000003'
        and profile_id = '00000000-0000-4000-b139-000000000003' $$,
  'leaving a conversation still works, and a thread may drop to one');

-- ── 4. A conversation that moved to a room takes no new participant ─────────────────────────────

select throws_ok(
  $$ insert into public.conversation_participants (conversation_id, profile_id) values
       ('00000000-0000-4000-c139-000000000004', '00000000-0000-4000-b139-000000000001') $$,
  '23514',
  'conversation_migrated_to_room',
  'a migrated conversation takes no new participant, even its first');

select throws_ok(
  $$ update public.conversation_participants
        set conversation_id = '00000000-0000-4000-c139-000000000004'
      where conversation_id = '00000000-0000-4000-c139-000000000003'
        and profile_id = '00000000-0000-4000-b139-000000000001' $$,
  '23514',
  'conversation_migrated_to_room',
  'nor can a participant be moved into one');

-- ── 5. The stewardships read policy, in the catalog ─────────────────────────────────────────────

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'stewardships'
      and cmd = 'SELECT' and permissive = 'PERMISSIVE'),
  1,
  'stewardships keeps ONE permissive SELECT policy (the old one was replaced, not stacked)');

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'stewardships' and cmd <> 'SELECT'),
  0,
  'stewardships has no insert, update, delete or all policy: the read stays read only');

select is(
  (select roles::text[] from pg_policies
    where schemaname = 'public' and tablename = 'stewardships'
      and policyname = 'stewardships: own, co-steward and staff read'),
  array['authenticated']::text[],
  'the read policy is for signed-in callers only');

select is(has_function_privilege('anon', 'private.leads_scope(text, uuid)', 'execute'), false,
  'anon cannot execute private.leads_scope');
select is(has_function_privilege('authenticated', 'private.leads_scope(text, uuid)', 'execute'), true,
  'authenticated keeps EXECUTE on private.leads_scope, which the policy needs');
select is(has_function_privilege('authenticated', 'public.enforce_conversation_one_to_one()', 'execute'), false,
  'no browser role can call the trigger function directly');

-- ── 6. The stewardships read policy, by seat ────────────────────────────────────────────────────

set local role authenticated;

-- L leads circle X by a host edge: reads the three edges on X, suspended included, and not Y or Z.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a139-000000000004', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select id::text from public.stewardships
      where id::text like '00000000-0000-4000-d139-%' order by id $$,
  $$ values ('00000000-0000-4000-d139-000000000001'), ('00000000-0000-4000-d139-000000000002'),
            ('00000000-0000-4000-d139-000000000003') $$,
  'a leader by edge reads every edge on the scope they lead, the suspended one included');

select throws_ok(
  $$ insert into public.stewardships (profile_id, role, scope_type, scope_id) values
       ('00000000-0000-4000-b139-000000000001', 'crew', 'circle', '00000000-0000-4000-e139-00000000000a') $$,
  '42501',
  'new row violates row-level security policy for table "stewardships"',
  'a leader cannot add a steward: no insert policy');

select results_eq(
  $$ with u as (update public.stewardships set state = 'suspended'
                 where id = '00000000-0000-4000-d139-000000000002' returning id)
     select count(*)::int from u $$,
  $$ values (0) $$,
  'a leader cannot suspend a co-steward: no update policy');

select results_eq(
  $$ with d as (delete from public.stewardships
                 where id = '00000000-0000-4000-d139-000000000002' returning id)
     select count(*)::int from d $$,
  $$ values (0) $$,
  'a leader cannot remove a co-steward: no delete policy');

-- K crews circle X: any active edge is leadership of that scope (leadsScope), so K reads X too.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a139-000000000005', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select count(*)::int from public.stewardships where id::text like '00000000-0000-4000-d139-%' $$,
  $$ values (3) $$,
  'a crew edge leads its scope the same way, as leadsScope() in lib/core/stewardship.ts has it');

-- S holds only a SUSPENDED edge on X: not a leader, so only their own row.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a139-000000000006', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select id::text from public.stewardships where id::text like '00000000-0000-4000-d139-%' $$,
  $$ values ('00000000-0000-4000-d139-000000000003') $$,
  'a suspended steward reads only their own edge');

-- O leads circle Y: their own edge, nothing on X.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a139-000000000007', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select id::text from public.stewardships where id::text like '00000000-0000-4000-d139-%' $$,
  $$ values ('00000000-0000-4000-d139-000000000004') $$,
  'a leader of another scope reads nothing on this one');

-- H hosts circle Z by the leader column with no edge: reads E's edge on Z.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a139-000000000008', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select id::text from public.stewardships where id::text like '00000000-0000-4000-d139-%' $$,
  $$ values ('00000000-0000-4000-d139-000000000005') $$,
  'a leader by the circle host column reads the edges on that circle');

-- E crews circle Z and holds its only edge: reads that one row, and nothing on X or Y.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a139-000000000009', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select id::text from public.stewardships where id::text like '00000000-0000-4000-d139-%' $$,
  $$ values ('00000000-0000-4000-d139-000000000005') $$,
  'a steward of Z reads Z and nothing else');

-- A holds no edge and leads nothing.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a139-000000000001', 'role', 'authenticated')::text, true);

select is_empty(
  $$ select 1 from public.stewardships where id::text like '00000000-0000-4000-d139-%' $$,
  'a member with no edge reads no stewardships');

select results_eq(
  $$ select private.leads_scope('circle', '00000000-0000-4000-e139-00000000000a') $$,
  $$ values (false) $$,
  'leads_scope answers false for a member who leads nothing');

-- T is platform staff: reads every edge.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a139-000000000010', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select count(*)::int from public.stewardships where id::text like '00000000-0000-4000-d139-%' $$,
  $$ values (5) $$,
  'platform staff still read every edge');

-- anon: nothing.
reset role;
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

select is_empty(
  $$ select 1 from public.stewardships where id::text like '00000000-0000-4000-d139-%' $$,
  'anon reads no stewardships');

reset role;

select * from finish();
rollback;
