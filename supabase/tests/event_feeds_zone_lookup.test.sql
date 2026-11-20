-- pgTAP guard for PERF-040: the five event and density reads use public.tz_zone_lookup, not a materialized
-- list of every zone name, and still run.
--
-- Runs via `supabase test db` (see supabase/tests/README.md), NOT under vitest.

begin;
select plan(4);

select is(
  (select count(*)::int from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('density_by_city', 'public_organizer_events', 'public_calendar_feed',
                        'space_public_calendar_feed', 'event_calendar_feed', 'public_events')
      and p.prosrc ~ '\mzones\M'),
  0, 'no event or density read builds the zone list per call');

select is(
  (select count(*)::int from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('density_by_city', 'public_organizer_events', 'public_calendar_feed',
                        'space_public_calendar_feed', 'event_calendar_feed')
      and p.prosrc like '%public.tz_zone_lookup tz on tz.key = lower(e.time_zone)%'),
  5, 'all five reads join the keyed zone lookup');

select lives_ok($$select * from public.density_by_city()$$, 'density_by_city still runs');
select lives_ok($$select * from public.public_organizer_events('nobody-perf040')$$, 'public_organizer_events still runs');

select * from finish();
rollback;
