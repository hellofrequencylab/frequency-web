-- BOOK-004: the database refuses two live bookings that overlap, lets a reschedule overlap the booking
-- it replaces, and ignores cancelled bookings.
begin;
select plan(7);

insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');

insert into public.spaces (id, slug, name, type, entity_id, status, visibility) values
  ('00000000-0000-4000-b004-00000000000a', 'book004-space', 'BOOK-004 Space', 'business',
   (select id from public.entities where key = 'labs' limit 1), 'active', 'network');

insert into public.space_bookings (id, space_id, starts_at, ends_at, status) values
  ('00000000-0000-4000-b004-0000000000b1', '00000000-0000-4000-b004-00000000000a',
   '2030-01-08 18:00+00', '2030-01-08 19:00+00', 'confirmed');

select is(
  (select chain_id from public.space_bookings where id = '00000000-0000-4000-b004-0000000000b1'),
  '00000000-0000-4000-b004-0000000000b1'::uuid,
  'a new booking starts its own chain'
);

select throws_ok(
  $$ insert into public.space_bookings (space_id, starts_at, ends_at, status) values
     ('00000000-0000-4000-b004-00000000000a', '2030-01-08 18:30+00', '2030-01-08 19:00+00', 'pending') $$,
  '23P01',
  null,
  'a live booking that overlaps another with a different start is refused'
);

select lives_ok(
  $$ insert into public.space_bookings (space_id, starts_at, ends_at, status) values
     ('00000000-0000-4000-b004-00000000000a', '2030-01-08 19:00+00', '2030-01-08 19:30+00', 'confirmed') $$,
  'a booking that starts when another ends is allowed'
);

select lives_ok(
  $$ insert into public.space_bookings (id, space_id, starts_at, ends_at, status, rescheduled_from) values
     ('00000000-0000-4000-b004-0000000000b2', '00000000-0000-4000-b004-00000000000a',
      '2030-01-08 17:30+00', '2030-01-08 18:30+00', 'confirmed', '00000000-0000-4000-b004-0000000000b1') $$,
  'a reschedule may overlap the booking it replaces while that one is still live'
);

select is(
  (select chain_id from public.space_bookings where id = '00000000-0000-4000-b004-0000000000b2'),
  '00000000-0000-4000-b004-0000000000b1'::uuid,
  'a reschedule joins the chain of the booking it replaces'
);

update public.space_bookings set status = 'cancelled' where id = '00000000-0000-4000-b004-0000000000b1';

select lives_ok(
  $$ insert into public.space_bookings (space_id, starts_at, ends_at, status) values
     ('00000000-0000-4000-b004-00000000000a', '2030-01-08 18:30+00', '2030-01-08 19:00+00', 'cancelled') $$,
  'a cancelled booking never blocks'
);

select throws_ok(
  $$ insert into public.space_bookings (space_id, starts_at, ends_at, status) values
     ('00000000-0000-4000-b004-00000000000a', '2030-01-08 18:00+00', '2030-01-08 18:15+00', 'confirmed') $$,
  '23P01',
  null,
  'the moved booking still blocks a different booker'
);

select * from finish();
rollback;
