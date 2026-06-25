-- =============================================================================
-- QR stats: bounded server-side aggregation RPC (fixes the unbounded full-table
-- load on /admin/qr/stats, which fetched EVERY qr_scans row and rolled it up in
-- JS -- a naive .limit() there would silently undercount totals/funnel).
--
-- qr_stats_summary(p_days) returns ONE jsonb object with the SAME aggregates the
-- page's summarizeScans/summarizeLocations produce, computed via group-by so the
-- result set is bounded (one row of per-code stats per qr_code -- a small table --
-- and one row per location cluster), never proportional to scan volume.
--
-- SECURITY DEFINER so it reads the RLS-locked qr_scans/qr_codes regardless of the
-- caller's context; the staff gate lives at the calling page (requireAdmin). Only
-- ever called from server code through the SERVICE ROLE, so it is locked to
-- service_role (ADR-371: a new public fn is auto-granted EXECUTE to anon+
-- authenticated directly, so we revoke those explicitly). search_path pinned.
--
-- ADDITIVE + idempotent (create or replace; re-runnable grants).
--
-- NOTE (owner): like ADR-371 / 20260818000100, this repo migration does not
-- retroactively alter the LIVE database -- apply to production (Supabase MCP /
-- dashboard) and record it, or the deployed grants stand until then.
--
-- ROLLBACK:  drop function if exists public.qr_stats_summary(integer);
-- =============================================================================

create or replace function public.qr_stats_summary(p_days integer default 30)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with
  -- One row of scalars: total, unique signed-in scanners, and the qr/nfc split
  -- (legacy/null medium counts as qr, matching the JS default).
  totals as (
    select
      count(*)                                                        as total,
      count(distinct profile_id) filter (where profile_id is not null) as uniq,
      count(*) filter (where medium = 'nfc')                          as nfc,
      count(*) filter (where medium is distinct from 'nfc')           as qr
    from public.qr_scans
  ),
  -- Trailing p_days UTC-date buckets, oldest -> newest, zero-filled. The bucket
  -- date is the scan's UTC date (matches dayKey = toISOString().slice(0,10)).
  day_series as (
    select to_char(d, 'YYYY-MM-DD') as date
    from generate_series(
           ((now() at time zone 'utc')::date) - (p_days - 1),
           ((now() at time zone 'utc')::date),
           interval '1 day'
         ) as d
  ),
  day_counts as (
    select to_char((scanned_at at time zone 'utc')::date, 'YYYY-MM-DD') as date,
           count(*) as count
    from public.qr_scans
    group by 1
  ),
  daily as (
    select s.date, coalesce(c.count, 0)::int as count
    from day_series s
    left join day_counts c on c.date = s.date
    order by s.date asc
  ),
  -- Per-code totals for ALL codes (bounded by qr_codes, a small table). The page
  -- needs every code's scan count for the acquisition scan->signup join, not just
  -- the top N, so returning all of them is what keeps numbers identical.
  per_code as (
    select qr_code_id as code_id,
           count(*)::int as total,
           count(distinct profile_id) filter (where profile_id is not null)::int as uniq
    from public.qr_scans
    group by qr_code_id
  ),
  -- City-granular clusters: round to 2 decimals (~1km), rows missing either coord
  -- drop, key is 'lng,lat'. Representative city = a stable non-null label in the
  -- cluster (falls back to 'Unknown'); country = the matching one.
  loc_clusters as (
    select
      round(lng::numeric, 2) as lng,
      round(lat::numeric, 2) as lat,
      count(*)::int          as scans,
      (array_agg(city    order by city    nulls last))[1]    as city,
      (array_agg(country order by country nulls last))[1]    as country
    from public.qr_scans
    where lat is not null and lng is not null
    group by round(lng::numeric, 2), round(lat::numeric, 2)
  ),
  locations as (
    select
      (lng::text || ',' || lat::text)        as key,
      coalesce(city, 'Unknown')              as city,
      country,
      lat::double precision                  as lat,
      lng::double precision                  as lng,
      scans
    from loc_clusters
    order by scans desc
  )
  select jsonb_build_object(
    'total',  (select total from totals),
    'unique', (select uniq  from totals),
    'by_medium', jsonb_build_object(
      'qr',  (select qr  from totals),
      'nfc', (select nfc from totals)
    ),
    'daily', coalesce(
      (select jsonb_agg(jsonb_build_object('date', date, 'count', count)) from daily),
      '[]'::jsonb
    ),
    'per_code', coalesce(
      (select jsonb_agg(jsonb_build_object('code_id', code_id, 'total', total, 'unique', uniq)) from per_code),
      '[]'::jsonb
    ),
    'locations', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'key', key, 'city', city, 'country', country, 'lat', lat, 'lng', lng, 'scans', scans
      )) from locations),
      '[]'::jsonb
    )
  );
$$;

comment on function public.qr_stats_summary(integer) is
  'QR stats dashboard aggregator (bounded). Returns one jsonb: total, unique, by_medium{qr,nfc}, daily[] (trailing p_days UTC buckets, zero-filled), per_code[] (all codes), locations[] (city-granular clusters). SECURITY DEFINER, service_role only; staff gate at the calling page. See app/(main)/admin/qr/stats/page.tsx.';

revoke execute on function public.qr_stats_summary(integer) from public, anon, authenticated;
grant  execute on function public.qr_stats_summary(integer) to service_role;
