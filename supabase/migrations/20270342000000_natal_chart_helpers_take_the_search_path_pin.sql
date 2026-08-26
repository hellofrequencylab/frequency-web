-- =============================================================================
-- Pin `search_path` on the three natal-chart synastry helpers (SCAN-520).
--
-- 20270326000000 added housing_safe_float, housing_aspect_score and
-- housing_natal_compat WITHOUT `set search_path`, which trips the Supabase
-- `function_search_path_mutable` advisor. Three findings, and the class appears in
-- neither `acceptedByName` nor `acceptedByTarget` of
-- scripts/maintenance/accepted-advisories.json, so every weekly maintenance sweep
-- surfaces all three as novel and unadjudicated.
--
-- THIS FAMILY ALREADY TOOK THIS FIX ONCE. 20261134000000 exists for no other purpose
-- than to re-declare housing_safe_date / housing_safe_int (and six siblings) with
-- `set search_path = public` after the advisor flagged them. 20270326000000's own
-- comment cites housing_safe_date/housing_safe_int as the pattern it follows, then
-- omits the single thing that dedicated migration was written to add. So this is
-- convention drift caught late, not a new decision.
--
-- SEVERITY, STATED HONESTLY: all three are SECURITY INVOKER, not DEFINER, and
-- 20270326000000 revokes EXECUTE from public, anon and authenticated by name
-- (ADR-959), so no browser role can reach them. They run only inside the
-- SECURITY DEFINER match RPCs, and every cross-call is already schema-qualified with
-- `public.`. This clears advisor noise and restores the convention; it does not close
-- a live exposure, and it should not be described as one.
--
-- CREATE OR REPLACE only: same signatures, same bodies, same volatility and STRICT
-- markers, adds `set search_path = public`. PostgreSQL preserves a replaced
-- function's ACL, so the three revokes from 20270326000000 survive untouched --
-- which is exactly how 20261134000000 behaved for its eight. Additive, idempotent,
-- SAFE to re-run. No em or en dashes.
-- =============================================================================

-- Fail-safe float parse for jsonb reads: junk yields NULL, never an error that would
-- abort the whole ranking query (same pattern as housing_safe_date/housing_safe_int).
create or replace function public.housing_safe_float(t text)
returns double precision language plpgsql immutable set search_path = public as $$
begin
  return t::double precision;
exception when others then
  return null;
end;
$$;

-- Score the angular separation of two ecliptic longitudes. Major aspects
-- (conjunction 0 -> 0.90, sextile 60 -> 0.80, square 90 -> 0.45, trine 120 -> 1.00,
-- opposition 180 -> 0.55) peak at exactness and decay linearly to the 0.5 neutral at
-- the edge of an 8-degree orb; no aspect = 0.5. Angles are >= 60 apart with orb 8, so
-- at most one aspect matches. STRICT: null in, null out.
create or replace function public.housing_aspect_score(lon_a double precision, lon_b double precision)
returns double precision language sql immutable strict set search_path = public as $$
  with sep as (
    select case when m > 180 then 360 - m else m end as s
    from (select mod(abs(lon_a - lon_b)::numeric, 360)::double precision as m) x
  )
  select coalesce(
    (select 0.5 + (t.score - 0.5) * (1 - abs(sep.s - t.angle) / 8.0)
       from (values (0.0, 0.90), (60.0, 0.80), (90.0, 0.45), (120.0, 1.00), (180.0, 0.55)) as t(angle, score)
      where abs(sep.s - t.angle) <= 8.0
      order by abs(sep.s - t.angle) asc
      limit 1),
    0.5)
  from sep
$$;

-- Weighted synastry blend of two stored charts (weights sum to 1; directional pairs
-- appear both ways, so the blend is symmetric). NULL, never a guess, when either
-- chart is null or any body's longitude is missing/junk, so callers can fall back to
-- the sun-sign signal.
create or replace function public.housing_natal_compat(ca jsonb, cb jsonb)
returns double precision language sql immutable set search_path = public as $$
  with pairs(ba, bb, w) as (values
    ('sun', 'sun', 0.25), ('moon', 'moon', 0.20),
    ('sun', 'moon', 0.10), ('moon', 'sun', 0.10),
    ('venus', 'mars', 0.10), ('mars', 'venus', 0.10),
    ('mercury', 'mercury', 0.15)
  ),
  scored as (
    select w,
           public.housing_aspect_score(
             public.housing_safe_float(ca #>> array['bodies', ba, 'lon']),
             public.housing_safe_float(cb #>> array['bodies', bb, 'lon'])) as sc
    from pairs
  )
  select case
    when ca is null or cb is null then null
    when exists (select 1 from scored where sc is null) then null
    else greatest(0, least(1, (select sum(w * sc) from scored)))::double precision
  end
$$;

-- Belt and braces on the ACL. CREATE OR REPLACE preserves privileges, so these are
-- expected to be no-ops; they are restated so that this file read alone still says
-- what the reachability contract is, and so a hand-run of it on a database where the
-- functions were dropped and recreated cannot leave them callable from a browser
-- role. Revoked BY NAME, because `from public` alone removes nothing (ADR-959).
revoke execute on function public.housing_safe_float(text) from public, anon, authenticated;
revoke execute on function public.housing_aspect_score(double precision, double precision) from public, anon, authenticated;
revoke execute on function public.housing_natal_compat(jsonb, jsonb) from public, anon, authenticated;
