-- AUTO-ENROL A SPACE'S MEMBERS INTO ITS SPACE CIRCLE (ADR-1395). The rule this suite exists for is
-- the OPT-OUT: `leaveCircle` deletes the membership row, so without a durable decline an enrolment
-- sweep would re-add everyone who ever left and the Leave control would do nothing.

begin;
select plan(11);

-- ── Fixture ──────────────────────────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-4000-a395-000000000001', 'enrol-owner@test.local'),
  ('00000000-0000-4000-a395-000000000002', 'enrol-member@test.local'),
  ('00000000-0000-4000-a395-000000000003', 'enrol-quitter@test.local');
delete from public.profiles where auth_user_id in (
  '00000000-0000-4000-a395-000000000001',
  '00000000-0000-4000-a395-000000000002',
  '00000000-0000-4000-a395-000000000003');
insert into public.profiles (id, auth_user_id, display_name, handle, is_active) values
  ('00000000-0000-4000-b395-000000000001', '00000000-0000-4000-a395-000000000001', 'Enrol Owner',   'enrol-owner',   true),
  ('00000000-0000-4000-b395-000000000002', '00000000-0000-4000-a395-000000000002', 'Enrol Member',  'enrol-member',  true),
  ('00000000-0000-4000-b395-000000000003', '00000000-0000-4000-a395-000000000003', 'Enrol Quitter', 'enrol-quitter', true);

-- Creating the Space attaches its Space Circle (ADR-1391's trigger).
insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility, plan) values
  ('00000000-0000-4000-c395-000000000001', 'enrol-test', 'Enrol Test', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b395-000000000001', 'active', 'network', 'business');

insert into public.space_membership_tiers (id, space_id, name, price_cents, interval, is_active)
values ('00000000-0000-4000-d395-000000000001', '00000000-0000-4000-c395-000000000001', 'Members', 1000, 'month', true);

-- ── A membership becoming active enrols its member ───────────────────────────────────────────
insert into public.space_memberships (space_id, member_profile_id, tier_id, status)
values ('00000000-0000-4000-c395-000000000001', '00000000-0000-4000-b395-000000000002',
        '00000000-0000-4000-d395-000000000001', 'active');

select ok(
  exists (
    select 1 from public.memberships m join public.circles c on c.id = m.circle_id
     where c.space_id = '00000000-0000-4000-c395-000000000001' and c.is_space_primary
       and m.profile_id = '00000000-0000-4000-b395-000000000002' and m.status = 'active'
  ),
  'an active Space membership puts its member on the Space Circle'
);

-- ── A cancelled membership enrols nobody ─────────────────────────────────────────────────────
insert into public.space_memberships (space_id, member_profile_id, tier_id, status)
values ('00000000-0000-4000-c395-000000000001', '00000000-0000-4000-b395-000000000003',
        '00000000-0000-4000-d395-000000000001', 'cancelled');

select ok(
  not exists (
    select 1 from public.memberships m join public.circles c on c.id = m.circle_id
     where c.space_id = '00000000-0000-4000-c395-000000000001' and c.is_space_primary
       and m.profile_id = '00000000-0000-4000-b395-000000000003'
  ),
  'a cancelled Space membership enrols nobody'
);

-- ── Activating it later does enrol ───────────────────────────────────────────────────────────
update public.space_memberships set status = 'active'
 where space_id = '00000000-0000-4000-c395-000000000001'
   and member_profile_id = '00000000-0000-4000-b395-000000000003';

select ok(
  exists (
    select 1 from public.memberships m join public.circles c on c.id = m.circle_id
     where c.space_id = '00000000-0000-4000-c395-000000000001' and c.is_space_primary
       and m.profile_id = '00000000-0000-4000-b395-000000000003'
  ),
  'a membership that becomes active later is enrolled then'
);

-- ── 🔴 LEAVING STICKS. The rule this whole suite exists for. ─────────────────────────────────
delete from public.memberships
 where profile_id = '00000000-0000-4000-b395-000000000003'
   and circle_id = (select id from public.circles
                     where space_id = '00000000-0000-4000-c395-000000000001' and is_space_primary);

select is(
  (select count(*)::int from public.space_circle_optouts
    where space_id = '00000000-0000-4000-c395-000000000001'
      and profile_id = '00000000-0000-4000-b395-000000000003'),
  1,
  'leaving a Space Circle records the decline'
);

-- A sweep is the strongest form of the question: it tries every active member.
select is(
  public.sync_space_circle_roster('00000000-0000-4000-c395-000000000001'),
  0,
  'a sweep adds nobody back who has left'
);

select ok(
  not exists (
    select 1 from public.memberships m join public.circles c on c.id = m.circle_id
     where c.space_id = '00000000-0000-4000-c395-000000000001' and c.is_space_primary
       and m.profile_id = '00000000-0000-4000-b395-000000000003'
  ),
  'and the member who left is still off the roster after the sweep'
);

-- A further billing event on their still-active membership must not undo the decline either.
update public.space_memberships set status = 'cancelled'
 where space_id = '00000000-0000-4000-c395-000000000001'
   and member_profile_id = '00000000-0000-4000-b395-000000000003';
update public.space_memberships set status = 'active'
 where space_id = '00000000-0000-4000-c395-000000000001'
   and member_profile_id = '00000000-0000-4000-b395-000000000003';

select ok(
  not exists (
    select 1 from public.memberships m join public.circles c on c.id = m.circle_id
     where c.space_id = '00000000-0000-4000-c395-000000000001' and c.is_space_primary
       and m.profile_id = '00000000-0000-4000-b395-000000000003'
  ),
  'nor does a later billing event re-enrol somebody who left'
);

-- ── A deliberate rejoin clears the decline ───────────────────────────────────────────────────
insert into public.memberships (profile_id, circle_id, status)
values ('00000000-0000-4000-b395-000000000003',
        (select id from public.circles where space_id = '00000000-0000-4000-c395-000000000001' and is_space_primary),
        'active');

select is(
  (select count(*)::int from public.space_circle_optouts
    where space_id = '00000000-0000-4000-c395-000000000001'
      and profile_id = '00000000-0000-4000-b395-000000000003'),
  0,
  'joining again on purpose clears the decline'
);

-- ── Enrolment is one-way: cancelling does not evict ──────────────────────────────────────────
update public.space_memberships set status = 'cancelled'
 where space_id = '00000000-0000-4000-c395-000000000001'
   and member_profile_id = '00000000-0000-4000-b395-000000000002';

select ok(
  exists (
    select 1 from public.memberships m join public.circles c on c.id = m.circle_id
     where c.space_id = '00000000-0000-4000-c395-000000000001' and c.is_space_primary
       and m.profile_id = '00000000-0000-4000-b395-000000000002'
  ),
  'a cancelled membership does NOT evict an existing Circle member'
);

-- ── The sweep is idempotent ──────────────────────────────────────────────────────────────────
select is(
  public.sync_space_circle_roster('00000000-0000-4000-c395-000000000001'),
  0,
  'a second sweep adds nobody twice'
);

-- ── An ordinary Circle collects no declines ──────────────────────────────────────────────────
insert into public.circles (id, name, slug, type, member_cap, status, host_id, space_id, access)
values ('00000000-0000-4000-e395-000000000001', 'Ordinary', 'enrol-test-ordinary', 'in-person', 50,
        'active', '00000000-0000-4000-b395-000000000001', '00000000-0000-4000-c395-000000000001', 'open');
insert into public.memberships (profile_id, circle_id, status)
values ('00000000-0000-4000-b395-000000000002', '00000000-0000-4000-e395-000000000001', 'active');
delete from public.memberships
 where profile_id = '00000000-0000-4000-b395-000000000002'
   and circle_id = '00000000-0000-4000-e395-000000000001';

select is(
  (select count(*)::int from public.space_circle_optouts
    where space_id = '00000000-0000-4000-c395-000000000001'
      and profile_id = '00000000-0000-4000-b395-000000000002'),
  0,
  'leaving an ORDINARY circle records no decline (there is no auto-enrolment to defend against)'
);

select * from finish();
rollback;
