-- Circle privacy proof (20270227000000_circle_privacy.sql · ADR-1015 · Circles C1).
--
-- Four things are proved here, and the FIRST one is the one that matters most:
--
--   1. THE POLICY IS RESTRICTIVE. `circles` carries four PERMISSIVE policies, all TO PUBLIC, and
--      one of them (`circles: authenticated read non-archived`) has no identity term in its main
--      arm. A permissive privacy policy would be OR-ed against a predicate that is already TRUE
--      and would change nothing. So the shape is asserted directly against pg_policy, not
--      inferred from behaviour -- a behavioural test can pass by accident, a catalog test cannot.
--   2. THE ROW IS INVISIBLE from every seat that must not have it: anon, a signed-in non-member,
--      and a member of a DIFFERENT circle -- through the table AND through every SECURITY DEFINER
--      RPC that names a circle.
--   3. THE ROW IS VISIBLE to the seats that must have it: the active member, the Host, a steward
--      of the owning Space, and platform staff.
--   4. THE FORBIDDEN CELLS ARE REFUSED by the database: the row-local CHECKs (visibility domain,
--      the unlisted mirror) and the cross-table trigger (personal-circle-is-paid, cross-tenant
--      link, plan floor).
--
-- One transaction, rolled back: nothing persists. Fixture style follows
-- space_tenancy_walls.test.sql, including the auto-provisioned-profile cleanup.

begin;
select plan(29);

-- ── Fixture (seeded as postgres, which RLS does not bind) ────────────────────────────────────────

insert into auth.users (id, email) values
  ('00000000-0000-4000-a100-000000000001', 'priv-host@test.local'),
  ('00000000-0000-4000-a100-000000000002', 'priv-member@test.local'),
  ('00000000-0000-4000-a100-000000000003', 'priv-stranger@test.local'),
  ('00000000-0000-4000-a100-000000000004', 'priv-space-owner@test.local'),
  ('00000000-0000-4000-a100-000000000005', 'priv-staff@test.local');

insert into public.profiles (id, auth_user_id, display_name, handle) values
  ('00000000-0000-4000-b100-000000000001', '00000000-0000-4000-a100-000000000001', 'Priv Host', 'priv-host'),
  ('00000000-0000-4000-b100-000000000002', '00000000-0000-4000-a100-000000000002', 'Priv Member', 'priv-member'),
  ('00000000-0000-4000-b100-000000000003', '00000000-0000-4000-a100-000000000003', 'Priv Stranger', 'priv-stranger'),
  ('00000000-0000-4000-b100-000000000004', '00000000-0000-4000-a100-000000000004', 'Priv Space Owner', 'priv-space-owner'),
  ('00000000-0000-4000-b100-000000000005', '00000000-0000-4000-a100-000000000005', 'Priv Staff', 'priv-staff');

-- trg_on_auth_user_created auto-provisions a profile per auth.users row, so each seeded user has
-- TWO profiles and get_my_profile_id()'s scalar subquery would error. Keep only the fixed ids.
delete from public.profiles
where auth_user_id in (
    '00000000-0000-4000-a100-000000000001','00000000-0000-4000-a100-000000000002',
    '00000000-0000-4000-a100-000000000003','00000000-0000-4000-a100-000000000004',
    '00000000-0000-4000-a100-000000000005')
  and id not in (
    '00000000-0000-4000-b100-000000000001','00000000-0000-4000-b100-000000000002',
    '00000000-0000-4000-b100-000000000003','00000000-0000-4000-b100-000000000004',
    '00000000-0000-4000-b100-000000000005');

update public.profiles set web_role = 'janitor'
where id = '00000000-0000-4000-b100-000000000005';

insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');

-- A root space must exist for default_space_id_to_root and for the personal-circle sentinel.
insert into public.spaces (id, slug, name, type, entity_id, status, visibility)
select '00000000-0000-4000-c100-0000000000cc'::uuid, 'priv-root', 'Priv Root', 'root',
       (select id from public.entities where key = 'labs' limit 1), 'active', 'network'
where not exists (select 1 from public.spaces where type = 'root');

-- A FREE business Space (cannot sell) and a BUSINESS-plan one (can).
insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility, plan) values
  ('00000000-0000-4000-c100-00000000000f', 'priv-free-space', 'Priv Free Space', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b100-000000000004', 'active', 'network', 'free'),
  ('00000000-0000-4000-c100-00000000000b', 'priv-biz-space', 'Priv Biz Space', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b100-000000000004', 'active', 'network', 'business');

-- THE PRIVATE PERSONAL CIRCLE. space_id left NULL on purpose so default_space_id_to_root stamps
-- the root sentinel, exactly as the app's create flow does -- this is the case the space-scoped
-- policy provably cannot cover.
insert into public.circles (id, name, slug, type, status, host_id, visibility) values
  ('00000000-0000-4000-e100-000000000001', 'Priv Personal', 'priv-personal', 'online', 'active',
   '00000000-0000-4000-b100-000000000001', 'private');

-- A PRIVATE circle owned by the business Space, and a PUBLIC control.
insert into public.circles (id, name, slug, type, status, space_id, visibility) values
  ('00000000-0000-4000-e100-000000000002', 'Priv Space Circle', 'priv-space-circle', 'online', 'active',
   '00000000-0000-4000-c100-00000000000b', 'private');
insert into public.circles (id, name, slug, type, status, visibility, city, latitude, longitude) values
  ('00000000-0000-4000-e100-000000000003', 'Priv Public Control', 'priv-public-control', 'online', 'active',
   'public', 'Testville', 45.5, -122.6);

-- An unrelated circle, so the "member of a DIFFERENT circle" seat is a real one.
insert into public.circles (id, name, slug, type, status, visibility) values
  ('00000000-0000-4000-e100-000000000004', 'Priv Other', 'priv-other', 'online', 'active', 'public');

insert into public.memberships (profile_id, circle_id, status) values
  ('00000000-0000-4000-b100-000000000002', '00000000-0000-4000-e100-000000000001', 'active'),
  ('00000000-0000-4000-b100-000000000003', '00000000-0000-4000-e100-000000000004', 'active');

-- ── 1. THE SHAPE. The catalog, not the behaviour ─────────────────────────────────────────────────

select is(
  (select polpermissive from pg_policy
    where polrelid = 'public.circles'::regclass and polname = 'circles_visibility_restrictive'),
  false,
  'the visibility policy is RESTRICTIVE -- a PERMISSIVE one would OR against the identity-free legacy read policy and grant every private circle to everyone'
);

select is(
  (select polcmd::text from pg_policy
    where polrelid = 'public.circles'::regclass and polname = 'circles_visibility_restrictive'),
  'r',
  'it is a SELECT policy'
);

-- The legacy policy it has to survive: still permissive, still TO PUBLIC, still identity-free in
-- its first arm. If this ever stops being true the reasoning above needs revisiting, so pin it.
select is(
  (select polpermissive from pg_policy
    where polrelid = 'public.circles'::regclass and polname = 'circles: authenticated read non-archived'),
  true,
  'the legacy read policy is still PERMISSIVE and still TO PUBLIC -- the reason RESTRICTIVE is mandatory'
);

select ok(
  (select count(*) from pg_policy where polrelid = 'public.circles'::regclass and not polpermissive) >= 5,
  'circles now carries at least five RESTRICTIVE policies (four space-scoped + visibility)'
);

-- The mirror, as a real constraint rather than a convention.
select ok(
  exists (select 1 from pg_constraint
          where conrelid = 'public.circles'::regclass
            and conname = 'circles_visibility_unlisted_mirror_check'),
  'the unlisted mirror is a CHECK constraint, not a UI rule'
);

-- The personal circle really did land on the ROOT sentinel, not NULL.
select is(
  (select s.type from public.spaces s
     join public.circles c on c.space_id = s.id
    where c.id = '00000000-0000-4000-e100-000000000001'),
  'root',
  'a personal circle is stamped with the ROOT space, never NULL -- the sentinel convention holds'
);

-- And the space predicate is provably useless for it, which is why this policy exists.
select ok(
  private.can_view_space_content(
    (select space_id from public.circles where id = '00000000-0000-4000-e100-000000000001')),
  'can_view_space_content is TRUE for the root space -- the space-isolation policy is a no-op for personal circles'
);

-- ── 2. INVISIBLE from every seat that must not have it ───────────────────────────────────────────

set local role anon;

select is_empty(
  $$ select id from public.circles where slug = 'priv-personal' $$,
  'anon cannot read a private PERSONAL circle'
);
select is_empty(
  $$ select id from public.circles where slug = 'priv-space-circle' $$,
  'anon cannot read a private SPACE circle'
);
select isnt_empty(
  $$ select id from public.circles where slug = 'priv-public-control' $$,
  'anon still reads a public circle -- the policy narrows nothing it should not'
);
select is_empty(
  $$ select id from public.public_circles(200) where slug in ('priv-personal', 'priv-space-circle') $$,
  'the public_circles RPC drops private circles'
);
select is_empty(
  $$ select id from public.public_circle_by_id('00000000-0000-4000-e100-000000000001') $$,
  'public_circle_by_id does NOT resolve a private circle by direct link -- the clause 20261157000000 deliberately left out'
);
select is_empty(
  $$ select id from public.circles_near(45.5, -122.6, 50) where slug in ('priv-personal','priv-space-circle') $$,
  'circles_near does not return private circles to anon'
);

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a100-000000000003')::text, true);

select is_empty(
  $$ select id from public.circles where slug = 'priv-personal' $$,
  'a signed-in member of a DIFFERENT circle cannot read a private circle -- the case the permissive legacy policy would have granted'
);
select is_empty(
  $$ select id from public.public_circle_by_id('00000000-0000-4000-e100-000000000002') $$,
  'a signed-in non-member cannot resolve a private space circle by id'
);
select is_empty(
  $$ select members from public.circle_momentum('00000000-0000-4000-e100-000000000001') $$,
  'circle_momentum returns no silhouette of a private circle to a non-member'
);
select isnt_empty(
  $$ select members from public.circle_momentum('00000000-0000-4000-e100-000000000004') $$,
  'circle_momentum still answers for a circle the caller may read'
);

-- ── 3. VISIBLE to the seats that must have it ────────────────────────────────────────────────────

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a100-000000000002')::text, true);
select isnt_empty(
  $$ select id from public.circles where slug = 'priv-personal' $$,
  'an ACTIVE MEMBER reads the private circle'
);

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a100-000000000001')::text, true);
select isnt_empty(
  $$ select id from public.circles where slug = 'priv-personal' $$,
  'the HOST reads their own private circle'
);

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a100-000000000004')::text, true);
select isnt_empty(
  $$ select id from public.circles where slug = 'priv-space-circle' $$,
  'a STEWARD of the owning Space reads its private circle'
);
select is_empty(
  $$ select id from public.circles where slug = 'priv-personal' $$,
  'that same Space steward does NOT get somebody else''s personal private circle'
);

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-a100-000000000005')::text, true);
select isnt_empty(
  $$ select id from public.circles where slug = 'priv-personal' $$,
  'PLATFORM STAFF (web_role janitor) keeps break-glass access'
);

reset role;

-- ── 4. THE FORBIDDEN CELLS ARE REFUSED ───────────────────────────────────────────────────────────

select throws_ok(
  $$ insert into public.circles (name, slug, type, status, visibility)
     values ('Priv Bad', 'priv-bad', 'online', 'active', 'sort-of-private') $$,
  '23514',
  null,
  'a visibility outside the domain is refused by CHECK'
);

-- The mirror cell: private, but sitting inside every discovery query that filters on `unlisted`.
-- The trigger normalises an honest write, so this asserts the CHECK by defeating the trigger --
-- an UPDATE that moves neither column the trigger keys on.
alter table public.circles disable trigger trg_circles_visibility_mirror;
select throws_ok(
  $$ update public.circles set unlisted = false where slug = 'priv-personal' $$,
  '23514',
  null,
  'visibility = private with unlisted = false is refused by CHECK, not left to the UI'
);
alter table public.circles enable trigger trg_circles_visibility_mirror;

-- A personal Circle can never be paid: its Space is root, a tier's Space never is.
select throws_ok(
  $$ insert into public.space_membership_tiers (space_id, name, price_cents, circle_id)
     values ('00000000-0000-4000-c100-00000000000b', 'Sell a personal circle', 2900,
             '00000000-0000-4000-e100-000000000001') $$,
  'P0001',
  'circle_link_cross_tenant',
  'a PERSONAL circle can never be sold -- only businesses charge'
);

-- Cross-tenant: Space A's tier may not link Space B's circle. Not in the owner's rulings; nothing
-- stops it on today's tree.
select throws_ok(
  $$ insert into public.space_membership_tiers (space_id, name, price_cents, circle_id)
     values ('00000000-0000-4000-c100-00000000000f', 'Steal a circle', 0,
             '00000000-0000-4000-e100-000000000002') $$,
  'P0001',
  'circle_link_cross_tenant',
  'a tier cannot link a Circle its Space does not own'
);

-- The plan floor. Same Space, same circle, only the price moves.
insert into public.circles (id, name, slug, type, status, space_id, visibility) values
  ('00000000-0000-4000-e100-000000000005', 'Priv Free Space Circle', 'priv-free-space-circle',
   'online', 'active', '00000000-0000-4000-c100-00000000000f', 'public');

select lives_ok(
  $$ insert into public.space_membership_tiers (space_id, name, price_cents, circle_id)
     values ('00000000-0000-4000-c100-00000000000f', 'Free access tier', 0,
             '00000000-0000-4000-e100-000000000005') $$,
  'a FREE Space may still grant access to its own Circle with a zero-price tier'
);

select throws_ok(
  $$ insert into public.space_membership_tiers (space_id, name, price_cents, circle_id)
     values ('00000000-0000-4000-c100-00000000000f', 'Paid tier on a free plan', 2900,
             '00000000-0000-4000-e100-000000000005') $$,
  'P0001',
  'circle_link_plan_floor',
  'a Space below the Business plan cannot sell a Circle membership'
);

select lives_ok(
  $$ insert into public.space_membership_tiers (space_id, name, price_cents, circle_id)
     values ('00000000-0000-4000-c100-00000000000b', 'Paid tier on business', 2900,
             '00000000-0000-4000-e100-000000000002') $$,
  'a Business-plan Space CAN sell its own Circle -- the meaningful cell still works'
);

select * from finish();
rollback;
