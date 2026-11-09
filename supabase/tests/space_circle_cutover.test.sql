-- THE SPACE CIRCLE IS RETIRED (ADR-1938, LIVE-2080). A Space's conversation is its Community wall now, so
-- creating a Space makes no Circle, a Space membership enrols nobody into one, and leaving a Circle records
-- no decline. Replaces space_circle.test.sql (ADR-1391) and space_circle_auto_enrol.test.sql (ADR-1395),
-- whose triggers 20270346029500 drops. 20270346029700 then drops the flag, its guard, the roster
-- functions and the opt-out table, and puts every Circle under one cap rule.

begin;
select plan(6);

-- ── Fixture ──────────────────────────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-4000-a396-000000000001', 'cutover-owner@test.local'),
  ('00000000-0000-4000-a396-000000000002', 'cutover-member@test.local');
delete from public.profiles where auth_user_id in (
  '00000000-0000-4000-a396-000000000001',
  '00000000-0000-4000-a396-000000000002');
insert into public.profiles (id, auth_user_id, display_name, handle, is_active) values
  ('00000000-0000-4000-b396-000000000001', '00000000-0000-4000-a396-000000000001', 'Cutover Owner',  'cutover-owner',  true),
  ('00000000-0000-4000-b396-000000000002', '00000000-0000-4000-a396-000000000002', 'Cutover Member', 'cutover-member', true);

insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility, plan) values
  ('00000000-0000-4000-c396-000000000001', 'cutover-test', 'Cutover Test', 'business',
   (select id from public.entities where key = 'labs' limit 1),
   '00000000-0000-4000-b396-000000000001', 'active', 'network', 'business');

-- ── A new Space makes no Circle ──────────────────────────────────────────────────────────────
select is(
  (select count(*)::int from public.circles where space_id = '00000000-0000-4000-c396-000000000001'),
  0,
  'a new Space gets no built-in Circle'
);

select ok(
  not exists (select 1 from pg_trigger where tgname in (
    'spaces_ensure_space_circle', 'space_memberships_enrol_space_circle', 'memberships_space_circle_optout')),
  'the Space Circle creation and roster triggers are gone'
);

-- ── A Space membership enrols nobody ─────────────────────────────────────────────────────────
insert into public.space_membership_tiers (id, space_id, name, price_cents, interval, is_active)
values ('00000000-0000-4000-d396-000000000001', '00000000-0000-4000-c396-000000000001', 'Members', 1000, 'month', true);
insert into public.space_memberships (space_id, member_profile_id, tier_id, status)
values ('00000000-0000-4000-c396-000000000001', '00000000-0000-4000-b396-000000000002',
        '00000000-0000-4000-d396-000000000001', 'active');

select is(
  (select count(*)::int from public.memberships where profile_id = '00000000-0000-4000-b396-000000000002'),
  0,
  'an active Space membership puts its member on no Circle'
);

-- ── Leaving a Circle records no decline ──────────────────────────────────────────────────────
insert into public.circles (id, name, slug, type, member_cap, status, host_id, space_id, access)
values ('00000000-0000-4000-e396-000000000001', 'Ordinary', 'cutover-test-ordinary', 'in-person', 50,
        'active', '00000000-0000-4000-b396-000000000001', '00000000-0000-4000-c396-000000000001', 'open');
insert into public.memberships (profile_id, circle_id, status)
values ('00000000-0000-4000-b396-000000000002', '00000000-0000-4000-e396-000000000001', 'active');
delete from public.memberships
 where profile_id = '00000000-0000-4000-b396-000000000002'
   and circle_id = '00000000-0000-4000-e396-000000000001';

select ok(
  to_regclass('public.space_circle_optouts') is null
  and not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = 'circles' and column_name = 'is_space_primary'),
  'the opt-out table and the Space Circle flag are gone'
);

-- ── One cap rule for every Circle ────────────────────────────────────────────────────────────
select throws_ok(
  $$ update public.circles set member_cap = 300 where id = '00000000-0000-4000-e396-000000000001' $$,
  '23514', null,
  'an in-person Circle cannot go past 50, the old Space Circle 300 is gone'
);

select ok(
  to_regclass('public.retired_space_circles') is not null,
  'the retired Space Circle slugs have a home for the old-link redirect'
);

select * from finish();
rollback;
