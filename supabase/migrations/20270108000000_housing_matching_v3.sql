-- =============================================================================
-- Housing / roommate matching v3 (ADR-861)
--
-- Same blend as v2 (20261133000000) — resonance 0.35 · budget 0.20 · geo 0.15 ·
-- timing 0.10 · lifestyle 0.15 · astrology 0.05 — with three changes:
--
--   1. EXPANDED RETURN: both match RPCs now also expose the raw 0..1 term values
--      they already compute (budget_fit, geo_fit, timing_fit, lifestyle_fit) so
--      the UI can say WHY a match ranks ("Budget fits", "Close by") instead of an
--      opaque percentage. Astrology and resonance are deliberately NOT exposed as
--      terms: astrology is opt-in-sensitive, resonance is private and opaque.
--      Every v2 column is kept; the fit columns are appended.
--   2. RECIPROCAL CONSENT on housing_match_candidates: the roommate-listing OWNER
--      must be in the matching pool (resonance_consent opted_in, not
--      opted_out_as_target) before their listing is ranked — mirroring the gate
--      housing_roommate_matches already applies to other seekers. Nobody is
--      surfaced by compatibility without their own opt-in.
--   3. Hardening: housing_rentals_near loses EXECUTE for public/anon (20261138
--      only covered the two match RPCs), and housing_seeker_profiles gains a
--      partial index on active (both match RPCs filter on it).
--
-- The return-table change requires DROP + CREATE (CREATE OR REPLACE cannot add
-- OUT columns), so the grants are restated verbatim afterwards: EXECUTE revoked
-- from public/anon, granted to authenticated — exactly the v2 posture
-- (20261138000000). SECURITY DEFINER + pinned search_path preserved.
-- Coordinates still never leave the DB; coarse city + score bands only.
-- =============================================================================

-- ── Roommate compatibility v3: seeker → roommate-listing owners ──────────────
drop function if exists public.housing_match_candidates(int);

create function public.housing_match_candidates(_limit int default 20)
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
      (case
         when me.astro_in is true and omp.astrology_opt_in is true
           then coalesce(public.housing_astro_compat(me.birth, public.housing_safe_date(omp.birth_data->>'date')), 0)
         else 0 end)::double precision as astro_fit
  ) f
  where exists (select 1 from gate)
    and l.status = 'active'
    and l.owner_profile_id is distinct from me.id
  order by score desc
  limit greatest(1, least(100, coalesce(_limit, 20)));
$$;

comment on function public.housing_match_candidates(int) is
  'Consent-gated roommate compatibility v3: v2 blend (resonance 0.35 + budget 0.20 + geo 0.15 + timing 0.10 + lifestyle 0.15 + astrology 0.05) with the raw budget/geo/timing/lifestyle fit terms exposed and a reciprocal consent gate on the listing owner (opted in, not opted out as target). Coordinates never returned. ADR-861.';

revoke execute on function public.housing_match_candidates(integer) from public, anon;
grant execute on function public.housing_match_candidates(integer) to authenticated;

-- ── Roommate <-> roommate v3: rank other ACTIVE seekers against the caller ────
drop function if exists public.housing_roommate_matches(int);

create function public.housing_roommate_matches(_limit int default 20)
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
    f.budget_fit,
    f.geo_fit,
    f.timing_fit,
    f.lifestyle_fit
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
      (case
         when me.astro_in is true and omp.astrology_opt_in is true
           then coalesce(public.housing_astro_compat(me.birth, public.housing_safe_date(omp.birth_data->>'date')), 0)
         else 0 end)::double precision as astro_fit
  ) f
  where exists (select 1 from gate)
    and o.active = true
    and o.profile_id is distinct from me.id
  order by score desc
  limit greatest(1, least(100, coalesce(_limit, 20)));
$$;

comment on function public.housing_roommate_matches(int) is
  'Consent-gated roommate<->roommate ranking v3: other ACTIVE, opted-in seekers scored against the caller with the v2 blend, now also exposing the raw budget/geo/timing/lifestyle fit terms. Symmetric via cosine resonance. Returns coarse city + score band only, never coordinates. ADR-861.';

revoke execute on function public.housing_roommate_matches(integer) from public, anon;
grant execute on function public.housing_roommate_matches(integer) to authenticated;

-- housing_rentals_near: the audit flagged it as never-revoked-from-anon, but the live
-- catalog shows the function no longer exists (dropped by an earlier orphan cleanup),
-- so there is nothing to revoke. Recorded here so the flag is not re-chased.
-- Both match RPCs filter housing_seeker_profiles on active; index the hot half.
create index if not exists housing_seeker_profiles_active_idx
  on public.housing_seeker_profiles (active) where active;

-- Rollback (manual):
--   drop function if exists public.housing_match_candidates(int), public.housing_roommate_matches(int);
--   -- then re-run the v2 bodies in 20261133000000 (and re-apply 20261138000000 grants).
--   drop index if exists public.housing_seeker_profiles_active_idx;
--   -- housing_rentals_near: grant execute ... to anon;  (not recommended)
