-- PERF-040: the city density read and the four remaining event feeds stop joining a materialized list of
-- every time zone name, and read the keyed table public.tz_zone_lookup instead.
--
-- SCAN-1210 (20270346062000) found that public_events joined a materialized CTE of ~509 zone names with a
-- nested loop (the planner estimates one event row), so each call did events x zones string comparisons,
-- and moved that one function onto public.tz_zone_lookup. Five functions kept the CTE: density_by_city
-- (the /discover/cities gate and the admin density signal), public_organizer_events, public_calendar_feed,
-- space_public_calendar_feed and event_calendar_feed. Measured on production 2026-11-19 in a rolled-back
-- transaction, same rows before and after: density_by_city 295 ms to 21 ms, public_organizer_events 15 ms
-- to 3 ms, public_calendar_feed 10 ms to 7 ms, space_public_calendar_feed 11 ms to 7 ms.
-- pg_stat_statements shows density_by_city at ~444 ms mean over 10,203 calls.
--
-- THE FIX is the SCAN-1210 swap, applied to each live body the way 20270346028100 swapped the catalog scan:
-- each body is re-created from its own current definition, so every gate its last migration gave it stays.
-- All five carry the same CTE text, read on production 2026-11-19, so it is removed by an exact string
-- replace (no regex), in its three shapes (followed by another CTE on a new line, by another CTE on the
-- same line, or by the main select). `join zones tz on` becomes `join public.tz_zone_lookup tz on`. The
-- block refuses if any body still names `zones` or did not change. CREATE OR REPLACE keeps every grant.
--
-- Additive and idempotent: a body already on the lookup table no longer matches and is left as it is.
-- ROLLBACK: re-run the DO block of 20270346028100 against the definitions in
-- 20270346024600_public_discovery_event_instants.sql (the zone CTE form).

begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $swap$
declare
  cte constant text :=
    E'with zones as materialized (\n'
    || E'    select distinct on (lower(name)) lower(name) as key, name\n'
    || E'    from private.tz_names()\n'
    || E'    -- Factory is tzdata''s unknown-local-zone placeholder; Intl rejects it, so use HOME.\n'
    || E'    where name <> ''Factory'' order by lower(name), name\n'
    || E'  )';
  r record;
  before text;
  d text;
begin
  for r in
    select p.oid
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('density_by_city', 'public_organizer_events', 'public_calendar_feed',
                        'space_public_calendar_feed', 'event_calendar_feed')
      and p.prosrc like '%with zones as materialized%'
  loop
    before := pg_get_functiondef(r.oid);
    d := before;
    d := replace(d, cte || E',\n  ', 'with ');
    d := replace(d, cte || ', ', 'with ');
    d := replace(d, cte || E'\n\n  ', '');
    d := replace(d, 'join zones tz on', 'join public.tz_zone_lookup tz on');
    if d = before or d ~ '\mzones\M' then
      raise exception 'PERF-040: % did not match the expected zone CTE; nothing changed', r.oid::regprocedure;
    end if;
    execute d;
  end loop;
end
$swap$;

commit;
