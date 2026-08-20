-- OWN-034 ruling C (ADR-1092) — `space_members` keeps the STAFF ladder, and paying members get
-- their OWN mode, `space_paid_members`.
--
-- Replaces circle_space_audience.test.sql (ADR-1021): the staff-OR-paid union that file proved is
-- retired by the ruling, and its one guard worth keeping — `is_space_member` NEVER learns about
-- paid memberships, because sixteen CRM/orders/notes policies key on it — is carried forward
-- here, joined by its mirror: the paid predicate never reads the staff ladder. The two audiences
-- staying two facts IS the ruling.

begin;
select plan(15);

-- ── Fixture ──────────────────────────────────────────────────────────────────────────────────
-- The auth rows first: profiles.auth_user_id carries a FOREIGN KEY to auth.users, so a profile
-- cannot exist without one. Same shape as circle_privacy.test.sql's fixture.
insert into auth.users (id, email) values
  ('00000000-0000-4000-a300-000000000001', 'paid-owner@test.local'),
  ('00000000-0000-4000-a300-000000000002', 'paid-viewer@test.local'),
  ('00000000-0000-4000-a300-000000000003', 'paid-payer@test.local'),
  ('00000000-0000-4000-a300-000000000004', 'paid-nobody@test.local'),
  ('00000000-0000-4000-a300-000000000005', 'paid-lapsed@test.local'),
  ('00000000-0000-4000-a300-000000000006', 'paid-editor@test.local');

-- 🔴 DROP THE TRIGGER'S PROFILES FIRST. `trg_on_auth_user_created`
-- (20261013000000_reconcile_signup_trigger.sql) fires on every auth.users insert and provisions a
-- profile automatically. Inserting our own on top leaves TWO profiles per auth id, and
-- get_my_profile_id() then resolves to the trigger's row instead of ours, so every
-- identity-dependent assertion silently answers about the wrong person — and the scalar subquery
-- in get_my_web_role() sees two rows and ERRORS OUT mid-file.
delete from public.profiles
where auth_user_id in (
  '00000000-0000-4000-a300-000000000001', '00000000-0000-4000-a300-000000000002',
  '00000000-0000-4000-a300-000000000003', '00000000-0000-4000-a300-000000000004',
  '00000000-0000-4000-a300-000000000005', '00000000-0000-4000-a300-000000000006'
);

-- ⚠️ `auth_user_id` is the join that makes private.get_my_profile_id() resolve: the JWT `sub` is
-- the AUTH id, NOT the profile id.
insert into public.profiles (id, auth_user_id, display_name, handle, is_active) values
  ('00000000-0000-4000-b300-000000000001', '00000000-0000-4000-a300-000000000001', 'Paid Owner',  'paid-owner',  true),
  ('00000000-0000-4000-b300-000000000002', '00000000-0000-4000-a300-000000000002', 'Paid Viewer', 'paid-viewer', true),
  ('00000000-0000-4000-b300-000000000003', '00000000-0000-4000-a300-000000000003', 'Paid Payer',  'paid-payer',  true),
  ('00000000-0000-4000-b300-000000000004', '00000000-0000-4000-a300-000000000004', 'Paid Nobody', 'paid-nobody', true),
  ('00000000-0000-4000-b300-000000000005', '00000000-0000-4000-a300-000000000005', 'Paid Lapsed', 'paid-lapsed', true),
  ('00000000-0000-4000-b300-000000000006', '00000000-0000-4000-a300-000000000006', 'Paid Editor', 'paid-editor', true);

insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility, plan) values
  ('00000000-0000-4000-c300-000000000001', 'paid-space', 'Paid Space', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b300-000000000001',
   'active', 'network', 'business');

-- The STAFF ladder. A `viewer` seat is deliberately the lowest rung: it must open the
-- `space_members` room and NOTHING else. The `admin` seat exists to prove editor+ staff still
-- reach the paid room — through the STEWARD arm (can_write_space_content), not the mode's own.
insert into public.space_members (space_id, profile_id, role, status) values
  ('00000000-0000-4000-c300-000000000001', '00000000-0000-4000-b300-000000000002', 'viewer', 'active'),
  ('00000000-0000-4000-c300-000000000001', '00000000-0000-4000-b300-000000000006', 'admin',  'active');

-- The MEMBERSHIPS. `tier_id` is NOT NULL, so both rows ride a tier; the tier is deliberately
-- UNLINKED (no circle_id) so trg_membership_tier_circle_link returns early and this fixture never
-- exercises the tier-link rules, which are circle_privacy.test.sql's subject. `status` values are
-- the REAL ones from space_memberships_status_check: active / waitlist / cancelled.
insert into public.space_membership_tiers (id, space_id, name, price_cents) values
  ('00000000-0000-4000-f300-000000000001', '00000000-0000-4000-c300-000000000001', 'Paid Tier', 2900);

insert into public.space_memberships (space_id, member_profile_id, tier_id, status) values
  ('00000000-0000-4000-c300-000000000001', '00000000-0000-4000-b300-000000000003',
   '00000000-0000-4000-f300-000000000001', 'active'),
  ('00000000-0000-4000-c300-000000000001', '00000000-0000-4000-b300-000000000005',
   '00000000-0000-4000-f300-000000000001', 'cancelled');

-- Two rooms. The PAID one is UNLISTED, so the RLS assertions below exercise the full fall-through
-- (can_see → not listed, not open → can_enter): a member who may enter sees the row, a stranger
-- does not even learn it exists. The inserts themselves prove circles_access_check accepts the
-- sixth value — a refused value would abort the whole file.
insert into public.circles (id, name, slug, type, status, space_id, unlisted, access) values
  ('00000000-0000-4000-e300-000000000001', 'Paid Room', 'paid-room', 'online', 'active',
   '00000000-0000-4000-c300-000000000001', true, 'space_paid_members'),
  ('00000000-0000-4000-e300-000000000002', 'Team Room', 'team-room', 'online', 'active',
   '00000000-0000-4000-c300-000000000001', false, 'space_members');

-- ── 1. The PAYING member: admitted to the paid room, and ONLY the paid room ──────────────────
set local role authenticated;

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a300-000000000003')::text, true);
select ok(private.is_space_paid_member('00000000-0000-4000-c300-000000000001'),
  'an ACTIVE space_memberships holder IS a paid member');
select ok(private.can_enter_circle('00000000-0000-4000-e300-000000000001', 'space_paid_members',
       '00000000-0000-4000-c300-000000000001', null),
  'and may enter a space_paid_members Circle -- the mode the ruling adds for exactly them');
select ok(not private.can_enter_circle('00000000-0000-4000-e300-000000000002', 'space_members',
       '00000000-0000-4000-c300-000000000001', null),
  '🔴 RULING C BOUNDARY: a paying member may NOT enter a space_members Circle -- that mode keeps the STAFF ladder (ADR-1021 had widened it; this is the narrowing back)');

-- ── 2. The STAFF viewer seat: the team room, and ONLY the team room ──────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a300-000000000002')::text, true);
select ok(private.can_enter_circle('00000000-0000-4000-e300-000000000002', 'space_members',
       '00000000-0000-4000-c300-000000000001', null),
  'a staff seat (lowest rung, viewer) still opens a space_members Circle -- the semantics the ruling KEEPS');
select ok(not private.can_enter_circle('00000000-0000-4000-e300-000000000001', 'space_paid_members',
       '00000000-0000-4000-c300-000000000001', null),
  'and a viewer seat does NOT open the paid room -- a seat is not a membership, and viewer is below the steward arm');
select ok(not private.is_space_paid_member('00000000-0000-4000-c300-000000000001'),
  'because a seat holder is not a paid member');

-- ── 3. Editor+ staff keep every Circle, through the STEWARD arm (ADR-1015 §5) ────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a300-000000000006')::text, true);
select ok(private.can_enter_circle('00000000-0000-4000-e300-000000000001', 'space_paid_members',
       '00000000-0000-4000-c300-000000000001', null),
  'an admin seat enters the paid room via can_write_space_content -- stewards get every Circle, so the paid arm never needs to know about seats');

-- ── 4. The refusals: lapsed and stranger ─────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a300-000000000005')::text, true);
select ok(not private.can_enter_circle('00000000-0000-4000-e300-000000000001', 'space_paid_members',
       '00000000-0000-4000-c300-000000000001', null),
  'a CANCELLED membership does not open the paid room -- active means active');

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a300-000000000004')::text, true);
select ok(not private.can_enter_circle('00000000-0000-4000-e300-000000000001', 'space_paid_members',
       '00000000-0000-4000-c300-000000000001', null),
  'someone with neither a seat nor a membership is refused -- the default is still deny');

-- ── 5. The whole stack, through RLS: the UNLISTED paid room exists only for those inside ─────
-- can_see_circle falls through to can_enter for an unlisted closed circle, and
-- circles_access_restrictive is the policy that runs it. This is the row-level consequence.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a300-000000000003')::text, true);
select isnt_empty(
  $$ select id from public.circles where slug = 'paid-room' $$,
  'through RLS, a paying member reads the unlisted paid room''s row');

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a300-000000000004')::text, true);
select is_empty(
  $$ select id from public.circles where slug = 'paid-room' $$,
  'through RLS, a stranger does not learn the unlisted paid room exists');

reset role;

-- ── 6. 🔴 THE TWO WALLS. The predicates never merge, in either direction. ────────────────────
select is_empty(
  $$ select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = 'is_space_member'
       and p.prosrc ilike '%space_memberships%' $$,
  'is_space_member NEVER learns about paid memberships: sixteen CRM/orders/notes policies key on '
  'it, and widening it would expose the pipeline, client notes, order history and disputes');

-- Regex, not LIKE: 'space_memberships' CONTAINS the substring 'space_members', so an ilike match
-- would fire on the predicate's own legitimate table. \M requires the match to END at a word
-- boundary, which 'space_membershipS' does not.
select is_empty(
  $$ select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = 'is_space_paid_member'
       and p.prosrc ~ 'space_members\M' $$,
  'is_space_paid_member never reads the staff ladder: a seat and a membership stay two facts');

select is_empty(
  $$ select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and p.proname = 'is_space_audience' $$,
  'the staff-OR-paid union predicate is GONE -- no future policy can reach for it by accident');

-- ── 7. The shape trigger knows the sixth value ───────────────────────────────────────────────
select throws_ok(
  $$ insert into public.circles (name, slug, type, status, access)
     values ('Paid Personal', 'paid-personal', 'online', 'active', 'space_paid_members') $$,
  'P0001',
  'circle_access_needs_space',
  'a PERSONAL circle cannot use space_paid_members -- the root Space has no memberships to admit from');

select * from finish();
rollback;
