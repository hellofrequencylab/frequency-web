-- pgTAP guard for public.density_by_city() after 20270346008800 (the city score counts events).
--
-- The /discover/cities gate scores density_by_city() rows in lib/analytics/density.ts. Before
-- that migration the function counted no events, so a city whose only activity was standalone
-- events scored zero and never got a page. This file pins:
--
--   · a city with only upcoming public standalone events returns a row with upcoming_events > 0
--     (a hide_address event counts by city);
--   · a Circle event counts under the Circle's city, not its own;
--   · cancelled, past, private, circle_only and draft events do not count;
--   · the function stays service_role only.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(7);

insert into public.circles (id, name, slug, type, status, unlisted, access, city) values
  ('00000000-0000-4000-e880-0000000000c1', 'GEO Density Circle', 'geo-density-circle', 'online', 'active', false, 'open', 'Densitycircleton');

insert into public.events (id, title, slug, scope_type, scope_id, visibility, status, starts_at, ends_at, join_mode, is_cancelled, city, hide_address)
values
  -- counted: standalone, upcoming, public
  ('00000000-0000-4000-e880-000000000001', 'GEO d1', 'geo-d1', 'public',
   '00000000-0000-4000-e880-0000000000aa', 'public', 'published',
   now() + interval '10 days', now() + interval '10 days 2 hours', 'rsvp', false, 'Eventonlyville', false),
  -- counted: standalone, hidden address
  ('00000000-0000-4000-e880-000000000002', 'GEO d2', 'geo-d2', 'public',
   '00000000-0000-4000-e880-0000000000aa', 'public', 'published',
   now() + interval '11 days', now() + interval '11 days 2 hours', 'rsvp', false, 'Eventonlyville', true),
  -- counted under the Circle's city, not 'Elsewhereville'
  ('00000000-0000-4000-e880-000000000003', 'GEO d3', 'geo-d3', 'circle',
   '00000000-0000-4000-e880-0000000000c1', 'public', 'published',
   now() + interval '12 days', now() + interval '12 days 2 hours', 'rsvp', false, 'Elsewhereville', false),
  -- NOT counted: cancelled
  ('00000000-0000-4000-e880-000000000004', 'GEO d4', 'geo-d4', 'public',
   '00000000-0000-4000-e880-0000000000aa', 'public', 'published',
   now() + interval '10 days', now() + interval '10 days 2 hours', 'rsvp', true, 'Ghostville', false),
  -- NOT counted: past
  ('00000000-0000-4000-e880-000000000005', 'GEO d5', 'geo-d5', 'public',
   '00000000-0000-4000-e880-0000000000aa', 'public', 'published',
   now() - interval '10 days', now() - interval '10 days' + interval '2 hours', 'rsvp', false, 'Ghostville', false),
  -- NOT counted: private
  ('00000000-0000-4000-e880-000000000006', 'GEO d6', 'geo-d6', 'public',
   '00000000-0000-4000-e880-0000000000aa', 'private', 'published',
   now() + interval '10 days', now() + interval '10 days 2 hours', 'rsvp', false, 'Ghostville', false),
  -- NOT counted: draft
  ('00000000-0000-4000-e880-000000000007', 'GEO d7', 'geo-d7', 'public',
   '00000000-0000-4000-e880-0000000000aa', 'public', 'draft',
   now() + interval '10 days', now() + interval '10 days 2 hours', 'rsvp', false, 'Ghostville', false);

select is(
  (select upcoming_events from public.density_by_city() where lower(city) = 'eventonlyville'),
  2::bigint,
  'EVENT-ONLY CITY: two upcoming public standalone events (one hide_address) count by city'
);
select is(
  (select circles + residents + listings from public.density_by_city() where lower(city) = 'eventonlyville'),
  0::bigint,
  'EVENT-ONLY CITY: the row exists on events alone (no circles, residents or listings)'
);
select is(
  (select upcoming_events from public.density_by_city() where lower(city) = 'densitycircleton'),
  1::bigint,
  'CIRCLE WINS: a Circle event counts under the Circle''s city'
);
select is_empty(
  $$ select 1 from public.density_by_city() where lower(city) = 'elsewhereville' $$,
  'CIRCLE WINS: the Circle event does not count under its own city'
);
select is_empty(
  $$ select 1 from public.density_by_city() where lower(city) = 'ghostville' $$,
  'GATES: cancelled, past, private and draft events do not count (no row at all)'
);

select ok(
  not has_function_privilege('anon', 'public.density_by_city()', 'execute')
  and not has_function_privilege('authenticated', 'public.density_by_city()', 'execute'),
  'GRANTS: anon and authenticated cannot execute density_by_city'
);
select ok(
  has_function_privilege('service_role', 'public.density_by_city()', 'execute'),
  'GRANTS: service_role can execute density_by_city'
);

select * from finish();
rollback;
