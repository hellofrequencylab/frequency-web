-- PERF-003: six public event/calendar RPCs rebuilt pg_catalog.pg_timezone_names (1,196 rows read from tzdata
-- files, ~80 ms) in a materialized CTE on EVERY call, and public_events(200) measured 537 ms against 2.7 ms with
-- the zone list fixed (production, 2026-11-02, 366 events). It backs /discover, the home live data and the
-- sitemap, and Vercel logs show 17 "canceling statement due to statement timeout" errors on /discover since
-- 2026-09-14. This swaps the catalog scan for a one-time snapshot table in the private schema (not exposed to
-- PostgREST). The function bodies are otherwise untouched: each is re-created from its own current definition.
-- tzdata names change a few times a year at most; a name missing from the snapshot falls back to
-- America/Los_Angeles, the same fallback an unknown zone already gets.
--
-- Additive and idempotent. ROLLBACK: re-run each function with `pg_catalog.pg_timezone_names` in the CTE (the
-- previous definitions are in 20270346024600_public_discovery_event_instants.sql and earlier); drop private.tz_names.

begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create schema if not exists private;

create table if not exists private.tz_names (name text primary key);
revoke all on private.tz_names from public, anon, authenticated;

insert into private.tz_names (name)
select name from pg_catalog.pg_timezone_names where name <> 'Factory'
on conflict (name) do nothing;

do $$
declare
  r record;
  def text;
begin
  for r in
    select p.oid, p.oid::regprocedure::text as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('density_by_city', 'event_calendar_feed', 'public_calendar_feed', 'public_events',
                        'public_organizer_events', 'space_public_calendar_feed')
      and p.prosrc like '%pg_catalog.pg_timezone_names%'
  loop
    def := replace(pg_get_functiondef(r.oid), 'pg_catalog.pg_timezone_names', 'private.tz_names');
    execute def;
  end loop;
end $$;

commit;
