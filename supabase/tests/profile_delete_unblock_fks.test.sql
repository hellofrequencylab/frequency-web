-- pgTAP behavioural guard for SEC-040: deleting an account is not refused by a Space follow,
-- membership or booking.
--
-- Before SEC-040, 24 foreign keys to profiles(id) had no ON DELETE rule, so auth.admin.deleteUser
-- (which cascades to the profile) failed for any member with one row in them. This deletes an auth
-- user who follows a Space and booked it, and checks the follow goes, the booking stays without its
-- member, and the booker rule still refuses a booking with no booker.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(6);

select is(
  (select count(*)::int from pg_constraint
    where contype = 'f' and confrelid = 'public.profiles'::regclass and confdeltype = 'a'),
  0, 'no foreign key to profiles is left without an ON DELETE rule');

insert into auth.users (id, email) values
  ('00000000-0000-4000-a040-000000000001', 'sec040-owner@test.local'),
  ('00000000-0000-4000-a040-000000000002', 'sec040-member@test.local');
delete from public.profiles where auth_user_id in
  ('00000000-0000-4000-a040-000000000001', '00000000-0000-4000-a040-000000000002');
insert into public.profiles (id, auth_user_id, display_name, handle, is_active) values
  ('00000000-0000-4000-b040-000000000001', '00000000-0000-4000-a040-000000000001', 'SEC040 Owner',  'sec040-owner',  true),
  ('00000000-0000-4000-b040-000000000002', '00000000-0000-4000-a040-000000000002', 'SEC040 Member', 'sec040-member', true);

insert into public.spaces (id, slug, name, type, entity_id, owner_profile_id, status, visibility, plan) values
  ('00000000-0000-4000-c040-000000000001', 'sec040-space', 'SEC040 Space', 'business',
   (select id from public.entities where key = 'labs' limit 1), '00000000-0000-4000-b040-000000000001',
   'active', 'network', 'business');

insert into public.space_follows (space_id, follower_profile_id) values
  ('00000000-0000-4000-c040-000000000001', '00000000-0000-4000-b040-000000000002');

insert into public.space_bookings (id, space_id, member_profile_id, starts_at, ends_at, status) values
  ('00000000-0000-4000-e040-000000000001', '00000000-0000-4000-c040-000000000001',
   '00000000-0000-4000-b040-000000000002', '2027-02-01T10:00:00Z', '2027-02-01T10:30:00Z', 'confirmed');

select lives_ok(
  $$delete from auth.users where id = '00000000-0000-4000-a040-000000000002'$$,
  'a member who follows and booked a Space can delete their account');

select is(
  (select count(*)::int from public.space_follows where space_id = '00000000-0000-4000-c040-000000000001'),
  0, 'their follow goes with them');

select is(
  (select member_profile_id from public.space_bookings where id = '00000000-0000-4000-e040-000000000001'),
  null::uuid, 'the Space keeps the booking, without the member');

select throws_ok(
  $$insert into public.space_bookings (space_id, starts_at, ends_at, status)
    values ('00000000-0000-4000-c040-000000000001', '2027-02-02T10:00:00Z', '2027-02-02T10:30:00Z', 'pending')$$,
  '23514', 'space_bookings: a booking needs a member or a guest name and email',
  'a new booking with no member and no guest is still refused');

select lives_ok(
  $$insert into public.space_bookings (space_id, guest_name, guest_email, starts_at, ends_at, status)
    values ('00000000-0000-4000-c040-000000000001', 'Guest', 'guest@test.local',
            '2027-02-03T10:00:00Z', '2027-02-03T10:30:00Z', 'pending')$$,
  'a guest booking still lands');

select * from finish();
rollback;
