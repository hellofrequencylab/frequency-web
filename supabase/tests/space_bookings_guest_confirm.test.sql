-- pgTAP guard for the website guest booking hold (migration 20270346008300, SCAN-834).
--
-- Pinned here: the hold columns exist, 'pending' is still a legal status (the hold rides it), the
-- one-active-per-slot index still refuses a second live hold on the same slot, and a hold that was
-- released (cancelled) frees the slot for the next booker. Runs via `supabase test db` (see
-- supabase/tests/README.md), NOT under vitest.

begin;
select plan(7);

select has_column('public', 'space_bookings', 'guest_confirm_token', 'guest_confirm_token exists');
select has_column('public', 'space_bookings', 'guest_confirm_expires_at', 'guest_confirm_expires_at exists');
select has_column('public', 'space_bookings', 'guest_confirmed_at', 'guest_confirmed_at exists');
select has_column('public', 'space_bookings', 'guest_opt_in', 'guest_opt_in exists');

-- A Space to book against (the seeding shape circle_privacy.test.sql uses).
insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');

insert into public.spaces (id, slug, name, type, entity_id, status, visibility)
select '00000000-0000-4000-c834-0000000000cc'::uuid, 'hold-root-834', 'Hold Root', 'root',
       (select id from public.entities where key = 'labs' limit 1), 'active', 'network'
where not exists (select 1 from public.spaces where type = 'root');

insert into public.spaces (id, slug, name, type, entity_id, status, visibility, plan) values
  ('00000000-0000-4000-a000-00000000b834', 'hold-test-space-834', 'Hold Test Space', 'business',
   (select id from public.entities where key = 'labs' limit 1), 'active', 'network', 'free');

select lives_ok(
  $q$insert into public.space_bookings
       (space_id, member_profile_id, guest_name, guest_email, starts_at, ends_at, status,
        guest_confirm_token, guest_confirm_expires_at)
     values
       ('00000000-0000-4000-a000-00000000b834', null, 'Ada', 'ada@test.local',
        '2030-01-01T10:00:00Z', '2030-01-01T10:30:00Z', 'pending',
        'tok-834-a', now() + interval '30 minutes')$q$,
  'a pending guest hold with a confirm token inserts');

select throws_ok(
  $q$insert into public.space_bookings
       (space_id, member_profile_id, guest_name, guest_email, starts_at, ends_at, status)
     values
       ('00000000-0000-4000-a000-00000000b834', null, 'Bob', 'bob@test.local',
        '2030-01-01T10:00:00Z', '2030-01-01T10:30:00Z', 'confirmed')$q$,
  '23505',
  null,
  'a live guest hold still blocks a second booking on the same slot');

update public.space_bookings set status = 'cancelled' where guest_confirm_token = 'tok-834-a';

select lives_ok(
  $q$insert into public.space_bookings
       (space_id, member_profile_id, guest_name, guest_email, starts_at, ends_at, status)
     values
       ('00000000-0000-4000-a000-00000000b834', null, 'Bob', 'bob@test.local',
        '2030-01-01T10:00:00Z', '2030-01-01T10:30:00Z', 'confirmed')$q$,
  'a released (cancelled) hold frees its slot');

select * from finish();
rollback;
