-- pgTAP guard for public.public_events after 20270346008700 (standalone events list by city).
--
-- The city pages filter public_events rows by city. Before that migration the `city` column was
-- the Circle's city only, so a standalone event (no Circle, ADR-254) came back with city = null
-- and dropped off every city page. This file pins the fallback and that the gates still hold:
--
--   · a standalone event returns its OWN city;
--   · a hide_address standalone event still lists by city (ADR-825: city-level discovery is kept);
--   · a Circle event still returns the Circle's city, not the event's;
--   · a Circle with no city falls back to the event's city;
--   · a draft standalone event with a city is still absent (the gate, not the city, decides);
--   · the RETURNS TABLE carries no street, postal code, venue or geog column.
--
-- Every read is made AS anon, the role the city pages use.
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(7);

insert into public.circles (id, name, slug, type, status, unlisted, access, city) values
  ('00000000-0000-4000-e870-0000000000c1', 'GEO City Circle', 'geo-city-circle', 'online', 'active', false, 'open', 'Testville'),
  ('00000000-0000-4000-e870-0000000000c2', 'GEO Cityless Circle', 'geo-cityless-circle', 'online', 'active', false, 'open', null);

insert into public.events (id, title, slug, scope_type, scope_id, visibility, status, starts_at, ends_at, join_mode, is_cancelled, city, hide_address)
values
  -- standalone, address shown
  ('00000000-0000-4000-e870-000000000001', 'GEO standalone', 'geo-standalone', 'public',
   '00000000-0000-4000-e870-0000000000aa', 'public', 'published',
   now() + interval '30 days', now() + interval '30 days 2 hours', 'rsvp', false, 'Ojai', false),
  -- standalone, address hidden until RSVP
  ('00000000-0000-4000-e870-000000000002', 'GEO hidden', 'geo-hidden', 'public',
   '00000000-0000-4000-e870-0000000000aa', 'public', 'published',
   now() + interval '30 days', now() + interval '30 days 2 hours', 'rsvp', false, 'Ojai', true),
  -- Circle event whose own city differs from the Circle's
  ('00000000-0000-4000-e870-000000000003', 'GEO circle', 'geo-circle', 'circle',
   '00000000-0000-4000-e870-0000000000c1', 'public', 'published',
   now() + interval '30 days', now() + interval '30 days 2 hours', 'rsvp', false, 'Elsewhere', false),
  -- Circle event on a Circle with no city
  ('00000000-0000-4000-e870-000000000004', 'GEO cityless', 'geo-cityless', 'circle',
   '00000000-0000-4000-e870-0000000000c2', 'public', 'published',
   now() + interval '30 days', now() + interval '30 days 2 hours', 'rsvp', false, 'Fallbackton', false),
  -- standalone DRAFT with a city: still never listed
  ('00000000-0000-4000-e870-000000000005', 'GEO draft', 'geo-draft', 'public',
   '00000000-0000-4000-e870-0000000000aa', 'public', 'draft',
   now() + interval '30 days', now() + interval '30 days 2 hours', 'rsvp', false, 'Ojai', false);

set local role anon;

select is(
  (select city from public.public_events(200) where id = '00000000-0000-4000-e870-000000000001'),
  'Ojai',
  'STANDALONE: an event with no Circle lists under its own city'
);
select is(
  (select city from public.public_events(200) where id = '00000000-0000-4000-e870-000000000002'),
  'Ojai',
  'HIDDEN ADDRESS: a hide_address standalone event still lists by city (ADR-825)'
);
select is(
  (select city from public.public_events(200) where id = '00000000-0000-4000-e870-000000000003'),
  'Testville',
  'CIRCLE WINS: a Circle event still reports the Circle''s city, not its own'
);
select is(
  (select city from public.public_events(200) where id = '00000000-0000-4000-e870-000000000004'),
  'Fallbackton',
  'CITYLESS CIRCLE: a Circle with no city falls back to the event''s own city'
);
select is_empty(
  $$ select 1 from public.public_events(200) where id = '00000000-0000-4000-e870-000000000005' $$,
  'DRAFT: a draft standalone event with a city is still absent'
);
select is(
  (select circle_id from public.public_events(200) where id = '00000000-0000-4000-e870-000000000001'),
  null::uuid,
  'a standalone row still carries circle_id = null (the return shape is unchanged)'
);

reset role;

select ok(
  pg_get_function_result('public.public_events(integer)'::regprocedure)
    !~* '(street|postal_code|venue_name|geog|location)',
  'PRIVACY: the RETURNS TABLE carries no street, postal code, venue, location line or geog'
);

select * from finish();
rollback;
