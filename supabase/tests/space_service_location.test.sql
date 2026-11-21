-- BOOK-010: a service carries where it happens, and the kind is limited to the three the app offers.
begin;
select plan(5);

insert into public.entities (id, key, name, kind)
select gen_random_uuid(), 'labs', 'Labs', 'for_profit'
where not exists (select 1 from public.entities where key = 'labs');

insert into public.spaces (id, slug, name, type, entity_id, status, visibility) values
  ('00000000-0000-4000-b010-00000000000a', 'book010-space', 'BOOK-010 Space', 'business',
   (select id from public.entities where key = 'labs' limit 1), 'active', 'network');

select has_column('public', 'space_service_types', 'location_kind', 'a service has a location kind');
select has_column('public', 'space_service_types', 'location_value', 'a service has a location value');

select throws_ok(
  $$ insert into public.space_service_types (space_id, name, location_kind)
     values ('00000000-0000-4000-b010-00000000000a', 'Bad kind', 'carrier_pigeon') $$,
  '23514',
  null,
  'an unknown location kind is refused'
);

select throws_ok(
  $$ insert into public.space_service_types (space_id, name, location_kind, location_value)
     values ('00000000-0000-4000-b010-00000000000a', 'Too long', 'video', repeat('x', 501)) $$,
  '23514',
  null,
  'a location longer than 500 characters is refused'
);

select lives_ok(
  $$ insert into public.space_service_types (space_id, name, location_kind, location_value)
     values ('00000000-0000-4000-b010-00000000000a', 'Intro call', 'video', 'https://meet.example.com/abc') $$,
  'a video service with its link saves'
);

select * from finish();
rollback;
