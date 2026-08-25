-- =============================================================================
-- Natal-chart matching (DEF-HOUS, ADR-1138)
--
-- 🔴 ORDERING (ADR-1111): APPLY THIS MIGRATION BEFORE THE CODE THAT SHIPS WITH IT
-- MERGES. The save action (match-actions.ts) writes member_match_prefs.natal_chart
-- on every birth-date save, so if the code deploys first, every astrology save
-- fails on a missing column. This PR carries the migration; apply it to production
-- immediately before merging (a merge is a deploy), and note that once applied,
-- every open branch lacking this file goes red on check:migrations until it takes
-- main — this PR merges first (ADR-1111 rule 2).
--
-- WHAT THIS DOES. The shipped astrology signal is sun-sign only (housing_matching_v2,
-- mirror of lib/astrology/signs.ts). Owner ruling 2026-08-25: full natal charts are
-- computed by an in-process JS ephemeris at PROFILE SAVE and STORED; matching reads
-- the stored chart. So:
--
--   1. member_match_prefs gains `natal_chart` jsonb — DERIVED data (recomputable from
--      birth_data at any save), written by the save action, shaped as
--      { v: 1, precision: 'date-only', bodies: { sun|moon|mercury|venus|mars|jupiter|
--      saturn: { lon, sign } } }. Same owner-only RLS as the rest of the row
--      (SENSITIVE-class, 20260821000000): no other member can read it, and no RPC
--      returns it — only the derived 0..1 astro term inside a match score ever
--      surfaces, and only when BOTH sides opted in.
--   2. Three pure helpers mirror lib/astrology/synastry.ts EXACTLY (the discipline
--      housing_sun_sign already keeps with signs.ts): housing_safe_float,
--      housing_aspect_score (major aspects, 8-degree orb, linear falloff to a 0.5
--      neutral), housing_natal_compat (weighted body-pair blend, symmetric).
--   3. Both match RPCs upgrade their astro term: chart-to-chart synastry when BOTH
--      sides have a stored chart, falling back to the shipped sun-sign compat, else 0.
--      Blend weights unchanged (astrology stays the quiet 5%); the both-sides
--      astrology_opt_in gate is unchanged. CREATE OR REPLACE (return tables are
--      untouched), so the v2/v3 grants — EXECUTE revoked from public/anon, granted to
--      authenticated (20261138000000, restated 20270108/20270109) — are preserved.
--
-- Existing rows with birth_data and no chart keep working on the sun-sign fallback;
-- their chart appears on their next save. No backfill required.
-- =============================================================================

-- ── 1. The stored chart ──────────────────────────────────────────────────────

alter table public.member_match_prefs
  add column if not exists natal_chart jsonb;

comment on column public.member_match_prefs.natal_chart is
  'DERIVED natal chart (ADR-1138): computed in-process from birth_data at profile save (lib/astrology/chart.ts), date-only precision, v1 shape { v, precision, bodies }. SENSITIVE-class like the rest of the row; owner-only RLS; never returned by any RPC — only the derived astro term inside a match score surfaces, and only when both sides opted in. Recomputable at any time; null falls back to the sun-sign signal.';

-- ── 2. Pure synastry helpers (mirror lib/astrology/synastry.ts EXACTLY) ──────

-- Fail-safe float parse for jsonb reads: junk yields NULL, never an error that would
-- abort the whole ranking query (same pattern as housing_safe_date/housing_safe_int).
create or replace function public.housing_safe_float(t text)
returns double precision language plpgsql immutable as $$
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
returns double precision language sql immutable strict as $$
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
-- appear both ways, so the blend is symmetric). NULL — never a guess — when either
-- chart is null or any body's longitude is missing/junk, so callers can fall back to
-- the sun-sign signal.
create or replace function public.housing_natal_compat(ca jsonb, cb jsonb)
returns double precision language sql immutable as $$
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

-- The helpers are only ever called inside the SECURITY DEFINER match RPCs; no browser
-- role needs them. Revoked by name (ADR-959: `from public` alone removes nothing).
revoke execute on function public.housing_safe_float(text) from public, anon, authenticated;
revoke execute on function public.housing_aspect_score(double precision, double precision) from public, anon, authenticated;
revoke execute on function public.housing_natal_compat(jsonb, jsonb) from public, anon, authenticated;

-- ── 3. The match RPCs read the stored chart ──────────────────────────────────
-- Bodies verbatim from v3 (20270108000000) and the fit-privacy revision (20270109000000)
-- except: `me` gains mp.natal_chart, and astro_fit becomes natal-first with the shipped
-- sun-sign compat as fallback. Return tables unchanged -> CREATE OR REPLACE, grants kept.

create or replace function public.housing_match_candidates(_limit int default 20)
returns table (
  listing_id    uuid,
  owner_id      uuid,
  resonance     double precision,
  rent_cents    integer,
  city          text,
  score         double precision,
  budget_fit    double precision,
  geo_fit       double precision,
  timing_fit    double precision,
  lifestyle_fit double precision
)
language sql stable security definer set search_path = public as $$
  with me as (
    select p.id,
           p.home_geocell_lat as glat, p.home_geocell_lng as glng,
           s.budget_min_cents, s.budget_max_cents, s.move_in_from,
           s.preferences as prefs,
           mp.astrology_opt_in as astro_in,
           mp.natal_chart as chart,
           public.housing_safe_date(mp.birth_data->>'date') as birth
    from public.profiles p
    left join public.housing_seeker_profiles s on s.profile_id = p.id
    left join public.member_match_prefs mp on mp.profile_id = p.id
    where p.auth_user_id = auth.uid()
  ),
  gate as (
    select 1 from public.resonance_consent c join me on me.id = c.profile_id where c.opted_in = true
  ),
  neighbors as (
    select n.profile_id as owner_id, n.similarity
    from me, lateral public.resonance_neighbors(me.id, 100) n
  )
  select
    l.id as listing_id,
    l.owner_profile_id as owner_id,
    coalesce(nb.similarity, 0) as resonance,
    h.rent_cents,
    l.city,
    greatest(0, least(1,
        0.35 * coalesce(nb.similarity, 0)
      + 0.20 * f.budget_fit
      + 0.15 * f.geo_fit
      + 0.10 * f.timing_fit
      + 0.15 * f.lifestyle_fit
      + 0.05 * f.astro_fit
    )) as score,
    f.budget_fit,
    f.geo_fit,
    f.timing_fit,
    f.lifestyle_fit
  from public.listings l
  join public.housing_listings h on h.listing_id = l.id and h.listing_type = 'roommate'
  cross join me
  -- Reciprocal consent: the OWNER must be in the matching pool before we rank them,
  -- mirroring housing_roommate_matches (resonate, don't extract).
  join public.resonance_consent oc
    on oc.profile_id = l.owner_profile_id and oc.opted_in = true and coalesce(oc.opted_out_as_target, false) = false
  left join neighbors nb on nb.owner_id = l.owner_profile_id
  left join public.housing_seeker_profiles os on os.profile_id = l.owner_profile_id
  left join public.member_match_prefs omp on omp.profile_id = l.owner_profile_id
  cross join lateral (
    select
      (case
         when me.budget_max_cents is null or h.rent_cents is null then 0.5
         when h.rent_cents <= me.budget_max_cents
              and (me.budget_min_cents is null or h.rent_cents >= me.budget_min_cents) then 1.0
         when h.rent_cents <= me.budget_max_cents then 0.8
         else 0.0 end)::double precision as budget_fit,
      (case
         when l.geocell_lat is null or me.glat is null then 0.3
         when abs(l.geocell_lat - me.glat) < 0.2 and abs(l.geocell_lng - me.glng) < 0.2 then 1.0
         else 0.4 end)::double precision as geo_fit,
      (case
         when h.available_from is null or me.move_in_from is null then 0.5
         else greatest(0, 1 - least(1, abs(h.available_from - me.move_in_from) / 60.0)) end)::double precision as timing_fit,
      public.housing_lifestyle_agreement(me.prefs, os.preferences) as lifestyle_fit,
      -- Natal-first (ADR-1138): chart-to-chart synastry when both sides stored a chart,
      -- else the shipped sun-sign compat, else 0. Both-sides opt-in gate unchanged.
      (case
         when me.astro_in is true and omp.astrology_opt_in is true
           then coalesce(public.housing_natal_compat(me.chart, omp.natal_chart),
                         public.housing_astro_compat(me.birth, public.housing_safe_date(omp.birth_data->>'date')),
                         0)
         else 0 end)::double precision as astro_fit
  ) f
  where exists (select 1 from gate)
    and l.status = 'active'
    and l.owner_profile_id is distinct from me.id
  order by score desc
  limit greatest(1, least(100, coalesce(_limit, 20)));
$$;

create or replace function public.housing_roommate_matches(_limit int default 20)
returns table (
  profile_id    uuid,
  resonance     double precision,
  city          text,
  score         double precision,
  budget_fit    double precision,
  geo_fit       double precision,
  timing_fit    double precision,
  lifestyle_fit double precision
)
language sql stable security definer set search_path = public as $$
  with me as (
    select p.id,
           s.budget_min_cents, s.budget_max_cents, s.move_in_from,
           s.search_lat, s.search_lng, s.preferences as prefs,
           mp.astrology_opt_in as astro_in,
           mp.natal_chart as chart,
           public.housing_safe_date(mp.birth_data->>'date') as birth
    from public.profiles p
    join public.housing_seeker_profiles s on s.profile_id = p.id
    left join public.member_match_prefs mp on mp.profile_id = p.id
    where p.auth_user_id = auth.uid()
  ),
  gate as (
    select 1 from public.resonance_consent c join me on me.id = c.profile_id where c.opted_in = true
  ),
  neighbors as (
    select n.profile_id, n.similarity
    from me, lateral public.resonance_neighbors(me.id, 100) n
  )
  select
    o.profile_id,
    coalesce(nb.similarity, 0) as resonance,
    o.search_city as city,
    greatest(0, least(1,
        0.35 * coalesce(nb.similarity, 0)
      + 0.20 * f.budget_fit
      + 0.15 * f.geo_fit
      + 0.10 * f.timing_fit
      + 0.15 * f.lifestyle_fit
      + 0.05 * f.astro_fit
    )) as score,
    -- Per-target budget/geo/timing are an inversion oracle for a fellow seeker; withhold them.
    -- The score above still uses the precise values. (ADR-863; unchanged here.)
    null::double precision as budget_fit,
    null::double precision as geo_fit,
    null::double precision as timing_fit,
    -- Lifestyle banded to three levels: enough for the "Similar lifestyle" chip, no gradient.
    (case when f.lifestyle_fit >= 0.75 then 1.0
          when f.lifestyle_fit >= 0.40 then 0.5
          else 0.0 end)::double precision as lifestyle_fit
  from public.housing_seeker_profiles o
  cross join me
  join public.resonance_consent oc
    on oc.profile_id = o.profile_id and oc.opted_in = true and coalesce(oc.opted_out_as_target, false) = false
  left join neighbors nb on nb.profile_id = o.profile_id
  left join public.member_match_prefs omp on omp.profile_id = o.profile_id
  cross join lateral (
    select
      (case
         when me.budget_max_cents is null or o.budget_max_cents is null then 0.5
         when greatest(coalesce(me.budget_min_cents, 0), coalesce(o.budget_min_cents, 0))
              <= least(me.budget_max_cents, o.budget_max_cents) then 1.0
         else 0.0 end)::double precision as budget_fit,
      (case
         when me.search_lat is null or o.search_lat is null then 0.3
         when abs(round(me.search_lat::numeric, 2) - round(o.search_lat::numeric, 2)) < 0.2
              and abs(round(me.search_lng::numeric, 2) - round(o.search_lng::numeric, 2)) < 0.2 then 1.0
         else 0.4 end)::double precision as geo_fit,
      (case
         when me.move_in_from is null or o.move_in_from is null then 0.5
         else greatest(0, 1 - least(1, abs(o.move_in_from - me.move_in_from) / 60.0)) end)::double precision as timing_fit,
      public.housing_lifestyle_agreement(me.prefs, o.preferences) as lifestyle_fit,
      -- Natal-first (ADR-1138): chart-to-chart synastry when both sides stored a chart,
      -- else the shipped sun-sign compat, else 0. Both-sides opt-in gate unchanged.
      (case
         when me.astro_in is true and omp.astrology_opt_in is true
           then coalesce(public.housing_natal_compat(me.chart, omp.natal_chart),
                         public.housing_astro_compat(me.birth, public.housing_safe_date(omp.birth_data->>'date')),
                         0)
         else 0 end)::double precision as astro_fit
  ) f
  where exists (select 1 from gate)
    and o.active = true
    and o.profile_id is distinct from me.id
  order by score desc
  limit greatest(1, least(100, coalesce(_limit, 20)));
$$;

comment on function public.housing_roommate_matches(int) is
  'Consent-gated roommate<->roommate ranking (ADR-863, ADR-1138): the v3 blend drives the score with a natal-first astro term (stored-chart synastry when both sides have one, sun-sign fallback), the returned budget/geo/timing fit terms are NULL (an inversion oracle for a fellow seeker) and lifestyle_fit is banded to {0,0.5,1}. Coarse city + score band only, never coordinates, birth data, or a chart.';

-- Rollback (manual): alter table public.member_match_prefs drop column natal_chart;
--   drop function if exists public.housing_natal_compat(jsonb,jsonb),
--     public.housing_aspect_score(double precision,double precision), public.housing_safe_float(text);
--   then re-apply 20270108000000 + 20270109000000 to restore the sun-sign-only RPC bodies.
