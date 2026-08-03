-- Cross-tenant proof for the tenancy walls (20270206000000 + 20270206000100).
--
-- Seeds two Spaces (A: active + network visibility; B: active + Private) with an owner each and
-- one plain (viewer) member in A, then asserts the walls from every seat:
--   * Space A's operator sees and writes ONLY Space A rows; every Space B read is empty and every
--     Space B write is denied by RLS.
--   * A plain member holds NO operator read (contacts are operator-only) and NO operator write,
--     but DOES see their own member-state row (space_follows self arm) and the published App
--     instance on a public surface.
--   * anon sees no CRM rows anywhere, sees a published instance on the public Space, and never
--     sees inside the Private Space.
-- The whole run is one transaction, rolled back at the end: nothing persists.
--
-- The behavioral half of the ADR-275 harness (see README.md); the definition half of the same
-- boundary is can_write_space_content.test.sql.

begin;
select plan(19);

-- ── Fixture (seeded as postgres, which RLS does not bind) ────────────────────────────────────────

insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-000000000001', 'walls-op-a@test.local'),
  ('00000000-0000-4000-a000-000000000002', 'walls-member-a@test.local'),
  ('00000000-0000-4000-a000-000000000003', 'walls-op-b@test.local');

insert into public.profiles (id, auth_user_id, display_name, handle) values
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000001', 'Walls Op A', 'walls-op-a'),
  ('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000002', 'Walls Member A', 'walls-member-a'),
  ('00000000-0000-4000-b000-000000000003', '00000000-0000-4000-a000-000000000003', 'Walls Op B', 'walls-op-b');

-- trg_on_auth_user_created auto-provisions a profile per auth.users row (a bare profiles insert,
-- no dependents), so each seeded user now has TWO profiles and get_my_profile_id()'s scalar
-- subquery would error with "more than one row". Keep only the fixed-id profiles above.
delete from public.profiles
where auth_user_id in (
    '00000000-0000-4000-a000-000000000001',
    '00000000-0000-4000-a000-000000000002',
    '00000000-0000-4000-a000-000000000003')
  and id not in (
    '00000000-0000-4000-b000-000000000001',
    '00000000-0000-4000-b000-000000000002',
    '00000000-0000-4000-b000-000000000003');

-- entities.key is constrained to foundation | labs and may already be seeded; reuse if present.
insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');

insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility) values
  ('00000000-0000-4000-c000-00000000000a', 'walls-space-a', 'Walls Space A', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b000-000000000001', 'active', 'network'),
  ('00000000-0000-4000-c000-00000000000b', 'walls-space-b', 'Walls Space B', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b000-000000000003', 'active', 'private');

insert into public.space_members (space_id, profile_id, role, status) values
  ('00000000-0000-4000-c000-00000000000a', '00000000-0000-4000-b000-000000000002', 'viewer', 'active');

insert into public.contacts (space_id, email) values
  ('00000000-0000-4000-c000-00000000000a', 'contact-a@test.local'),
  ('00000000-0000-4000-c000-00000000000b', 'contact-b@test.local');

insert into public.crm_tasks (space_id, title) values
  ('00000000-0000-4000-c000-00000000000a', 'Walls task A');

insert into public.space_membership_tiers (id, space_id, name) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-c000-00000000000b', 'Walls Tier B');

insert into public.app_instances (space_id, manifest_key, surface_type, status) values
  ('00000000-0000-4000-c000-00000000000a', 'walls-test-app', 'page', 'published'),
  ('00000000-0000-4000-c000-00000000000a', 'walls-test-app', 'page', 'draft'),
  ('00000000-0000-4000-c000-00000000000b', 'walls-test-app', 'page', 'published');

insert into public.space_follows (space_id, follower_profile_id) values
  ('00000000-0000-4000-c000-00000000000b', '00000000-0000-4000-b000-000000000002'),
  ('00000000-0000-4000-c000-00000000000b', '00000000-0000-4000-b000-000000000001');

-- A fresh local stack applies migrations as postgres WITHOUT the hosted platform's
-- default-privilege grants to anon/authenticated (production has them; verified). The POLICIES
-- are what this file tests, not the grant baseline, so grant the fixture tables inside this
-- rolled-back transaction to let the client roles reach the tables at all.
grant select, insert, update, delete on
  public.contacts, public.crm_tasks, public.space_membership_tiers,
  public.app_instances, public.space_follows
to anon, authenticated;

-- ── Seat 1: Space A's operator (owner) ───────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-000000000001', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select count(*)::int from contacts $$, $$ values (1) $$,
  'operator A sees exactly their own Space''s contact and nothing across the wall');

select is_empty(
  $$ select id from contacts where space_id = '00000000-0000-4000-c000-00000000000b' $$,
  'operator A sees zero Space B contacts');

select throws_ok(
  $$ insert into contacts (space_id, email)
     values ('00000000-0000-4000-c000-00000000000b', 'intruder@test.local') $$,
  '42501', null,
  'operator A cannot insert a contact into Space B');

select lives_ok(
  $$ insert into space_membership_tiers (space_id, name)
     values ('00000000-0000-4000-c000-00000000000a', 'Walls Tier A') $$,
  'operator A can create a membership tier in their own Space');

select is_empty(
  $$ update space_membership_tiers set name = 'Hijacked'
     where id = '00000000-0000-4000-d000-000000000001' returning id $$,
  'operator A''s update of Space B''s tier reaches zero rows');

select results_eq(
  $$ select count(*)::int from crm_tasks $$, $$ values (1) $$,
  'operator A sees their own Space''s CRM task');

select results_eq(
  $$ select count(*)::int from app_instances
     where space_id = '00000000-0000-4000-c000-00000000000a' $$, $$ values (2) $$,
  'operator A sees both their published and draft App instances');

select is_empty(
  $$ select id from app_instances where space_id = '00000000-0000-4000-c000-00000000000b' $$,
  'operator A sees no App instances inside the Private Space B');

-- ── Seat 2: a plain (viewer) member of Space A ───────────────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-000000000002', 'role', 'authenticated')::text, true);

select is_empty(
  $$ select id from contacts $$,
  'a plain member holds no operator read: contacts are invisible');

select throws_ok(
  $$ insert into crm_tasks (space_id, title)
     values ('00000000-0000-4000-c000-00000000000a', 'Member task') $$,
  '42501', null,
  'a plain member cannot write CRM rows in their own Space');

select results_eq(
  $$ select count(*)::int from app_instances
     where space_id = '00000000-0000-4000-c000-00000000000a' $$, $$ values (1) $$,
  'a plain member sees the published App instance only, never the draft');

select results_eq(
  $$ select count(*)::int from space_follows
     where follower_profile_id = '00000000-0000-4000-b000-000000000002' $$, $$ values (1) $$,
  'a member sees their own follow row (member-state self arm)');

select results_eq(
  $$ select count(*)::int from space_follows
     where space_id = '00000000-0000-4000-c000-00000000000b' $$, $$ values (1) $$,
  'a member sees only their own follow of Space B, not other members'' follows');

-- ── Seat 3: anon ─────────────────────────────────────────────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

select is_empty(
  $$ select id from contacts $$,
  'anon sees no CRM rows anywhere');

select results_eq(
  $$ select count(*)::int from app_instances $$, $$ values (1) $$,
  'anon sees exactly the published instance on the public Space');

select is_empty(
  $$ select id from app_instances where space_id = '00000000-0000-4000-c000-00000000000b' $$,
  'anon never sees inside the Private Space');

-- ── Seat 4: Space B's operator (cross-check from the far side of the wall) ───────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a000-000000000003', 'role', 'authenticated')::text, true);

select results_eq(
  $$ select count(*)::int from contacts $$, $$ values (1) $$,
  'operator B sees exactly their own Space''s contact');

select is_empty(
  $$ select id from contacts where space_id = '00000000-0000-4000-c000-00000000000a' $$,
  'operator B sees zero Space A contacts');

select results_eq(
  $$ select count(*)::int from app_instances
     where space_id = '00000000-0000-4000-c000-00000000000b' $$, $$ values (1) $$,
  'operator B sees their own Private-Space instance (can_view arm)');

select * from finish();
rollback;
