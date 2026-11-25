-- BOOK-009: a booking stores the booker's zone, refuses an oversized one, and a reschedule keeps it.
begin;
select plan(5);

insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');

insert into public.spaces (id, slug, name, type, entity_id, status, visibility) values
  ('00000000-0000-4000-b009-00000000000a', 'book009-space', 'BOOK-009 Space', 'business',
   (select id from public.entities where key = 'labs' limit 1), 'active', 'network');

select has_column('public', 'space_bookings', 'booker_time_zone', 'a booking has the booker''s zone');

select lives_ok(
  $$ insert into public.space_bookings (id, space_id, starts_at, ends_at, status, guest_name, guest_email, booker_time_zone)
     values ('00000000-0000-4000-b009-0000000000b1', '00000000-0000-4000-b009-00000000000a',
             '2030-02-05 18:00+00', '2030-02-05 19:00+00', 'confirmed', 'Guest', 'guest@example.com', 'America/New_York') $$,
  'a booking saves the zone the browser reported'
);

select throws_ok(
  $$ insert into public.space_bookings (space_id, starts_at, ends_at, status, guest_name, guest_email, booker_time_zone)
     values ('00000000-0000-4000-b009-00000000000a', '2030-02-06 18:00+00', '2030-02-06 19:00+00', 'confirmed',
             'Guest', 'guest@example.com', repeat('x', 65)) $$,
  '23514',
  null,
  'a zone longer than 64 characters is refused'
);

insert into public.space_bookings (id, space_id, starts_at, ends_at, status, guest_name, guest_email, rescheduled_from)
values ('00000000-0000-4000-b009-0000000000b2', '00000000-0000-4000-b009-00000000000a',
        '2030-02-05 20:00+00', '2030-02-05 21:00+00', 'confirmed', 'Guest', 'guest@example.com',
        '00000000-0000-4000-b009-0000000000b1');

select is(
  (select booker_time_zone from public.space_bookings where id = '00000000-0000-4000-b009-0000000000b2'),
  'America/New_York',
  'a reschedule without a zone keeps the old booking''s'
);

select is(
  (select chain_id from public.space_bookings where id = '00000000-0000-4000-b009-0000000000b2'),
  '00000000-0000-4000-b009-0000000000b1'::uuid,
  'the reschedule still joins the old booking''s chain'
);

select * from finish();
rollback;
