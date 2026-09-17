-- THE SPACE CIRCLE (ADR-1391): every real Space always has one primary Circle, hosted by the Space,
-- up to 300 members. It can be turned off (status inactive) but never deleted or moved while its Space
-- exists, and a Space created by any path gets one. Its door is OPEN and it is UNLISTED (ADR-1393).

begin;
select plan(12);

-- ── Fixture ──────────────────────────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-4000-a391-000000000001', 'space-circle-owner@test.local');
-- The signup trigger provisions a profile per auth user; drop it so ours is the only one.
delete from public.profiles where auth_user_id = '00000000-0000-4000-a391-000000000001';
insert into public.profiles (id, auth_user_id, display_name, handle, is_active) values
  ('00000000-0000-4000-b391-000000000001', '00000000-0000-4000-a391-000000000001', 'Space Circle Owner', 'space-circle-owner', true);

-- Creating the Space is the whole setup: the trigger must attach its Circle.
insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility, plan) values
  ('00000000-0000-4000-c391-000000000001', 'space-circle-test', 'Space Circle Test', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b391-000000000001', 'active', 'network', 'business');

-- ── Always attached ──────────────────────────────────────────────────────────────────────────
select is(
  (select count(*)::int from public.circles where space_id = '00000000-0000-4000-c391-000000000001' and is_space_primary),
  1,
  'a new Space gets exactly one Space Circle, by trigger'
);

select is(
  (select member_cap from public.circles where space_id = '00000000-0000-4000-c391-000000000001' and is_space_primary),
  300,
  'the Space Circle holds 300 members'
);

select is(
  (select status::text from public.circles where space_id = '00000000-0000-4000-c391-000000000001' and is_space_primary),
  'active',
  'a new Space''s Circle starts on'
);

-- THE DOOR (ADR-1393, amending ADR-1391's default). "Public, but not listed in the directory":
-- anyone who reaches it may join (access 'open'), and it appears in no discovery surface
-- (unlisted). The pair is what `canSeeCircle` already calls an unlisted-open Circle, and both
-- halves are written explicitly by ensure_space_circle rather than left to a column default.
select is(
  (select access from public.circles where space_id = '00000000-0000-4000-c391-000000000001' and is_space_primary),
  'open',
  'a new Space Circle is open to join'
);

select is(
  (select unlisted from public.circles where space_id = '00000000-0000-4000-c391-000000000001' and is_space_primary),
  true,
  'a new Space Circle stays out of the directory'
);

select ok(
  exists (
    select 1 from public.memberships m join public.circles c on c.id = m.circle_id
     where c.space_id = '00000000-0000-4000-c391-000000000001' and c.is_space_primary
       and m.profile_id = '00000000-0000-4000-b391-000000000001' and m.volunteer_role = 'host'
  ),
  'the Space owner runs it as host behind the scenes'
);

select is(
  public.ensure_space_circle('00000000-0000-4000-c391-000000000001', 'active'),
  (select id from public.circles where space_id = '00000000-0000-4000-c391-000000000001' and is_space_primary),
  'ensure_space_circle is idempotent: a second call returns the same Circle'
);

select throws_ok(
  $$ delete from public.circles where space_id = '00000000-0000-4000-c391-000000000001' and is_space_primary $$,
  'P0001', 'space_circle_is_attached',
  'a Space Circle cannot be deleted while its Space exists'
);

select throws_ok(
  $$ update public.circles set space_id = (select id from public.spaces where type = 'root' limit 1)
      where space_id = '00000000-0000-4000-c391-000000000001' and is_space_primary $$,
  'P0001', 'space_circle_is_attached',
  'a Space Circle cannot be moved to another Space or to a person'
);

select throws_ok(
  $$ update public.circles set member_cap = 301
      where space_id = '00000000-0000-4000-c391-000000000001' and is_space_primary $$,
  '23514', null,
  'the Space Circle cap stops at 300'
);

select lives_ok(
  $$ update public.circles set status = 'inactive'
      where space_id = '00000000-0000-4000-c391-000000000001' and is_space_primary $$,
  'turning it off is allowed'
);

-- Deleting the Space still takes its Circle with it (the cascade runs after the Space row is gone).
delete from public.spaces where id = '00000000-0000-4000-c391-000000000001';
select is(
  (select count(*)::int from public.circles where space_id = '00000000-0000-4000-c391-000000000001'),
  0,
  'deleting the Space removes its Space Circle'
);

select * from finish();
rollback;
