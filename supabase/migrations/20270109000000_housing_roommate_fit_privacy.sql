-- Roommate fit-term privacy (ADR-863). The v3 match RPCs expose the raw per-term fit values
-- so the UI can explain a match ("Budget fits", "Close by"). For the LISTING RPC
-- (housing_match_candidates) those terms describe a PUBLISHED listing plus the owner's own
-- matchable lifestyle, so exposing them is fine. For the SEEKER-to-SEEKER RPC
-- (housing_roommate_matches) they describe another private seeker, and three of them are an
-- inversion oracle for an opted-in caller who controls their own inputs:
--   * budget_fit is 1.0 iff the two ranges overlap → binary-search the caller's own bounds
--     against a target to recover the target's budget_min/max to the cent.
--   * timing_fit = 1 - |Δdays|/60 is CONTINUOUS → one read reveals |their move-in - mine|,
--     two reads reveal their exact move-in date.
--   * geo_fit's 0.2-degree boundary can be swept to pin the target's rounded coordinates to a
--     ~1 km cell, well below the "coarse city" contract.
--
-- Fix: the seeker-to-seeker RPC keeps computing all six terms for the SCORE (unchanged blend),
-- but its RETURNED budget/geo/timing columns are NULL (the app coalesces null to a neutral 0.5,
-- so those chips simply never fire on the People tab), and the returned lifestyle_fit is banded
-- to {0, 0.5, 1.0} so the "Similar lifestyle" chip still works without leaking a probeable
-- gradient. The overall score band and coarse city remain the only per-target signal. The
-- listing RPC is untouched.

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
    -- Per-target budget/geo/timing are an inversion oracle for a fellow seeker; withhold them.
    -- The score above still uses the precise values.
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
  'Consent-gated roommate<->roommate ranking (ADR-863): the v3 blend still drives the score, but the returned budget/geo/timing fit terms are NULL (an inversion oracle for a fellow seeker) and lifestyle_fit is banded to {0,0.5,1}. Coarse city + score band only, never coordinates or another seeker''s exact budget/date.';
revoke execute on function public.housing_roommate_matches(integer) from public, anon;
grant execute on function public.housing_roommate_matches(integer) to authenticated;
