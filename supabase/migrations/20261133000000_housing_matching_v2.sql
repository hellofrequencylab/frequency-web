-- =============================================================================
-- Housing / roommate matching v2 (ADR-39Y Phase 3)
--
-- Extends the consent-gated roommate blend with TIMING (available_from vs the
-- seeker's move-in window), LIFESTYLE agreement (the seeker-form preferences jsonb:
-- tidiness, rhythm, diet, house rules), and a QUIET astrology nudge (sun-sign only,
-- 5% weight, ONLY when both parties opted in). Adds a symmetric roommate<->roommate
-- RPC that ranks other active seekers against the caller.
--
-- The blend, clamped to [0,1]:
--   Resonance 0.35 · Budget 0.20 · Location 0.15 · Timing 0.10 · Lifestyle 0.15 · Astrology 0.05
--
-- Astrology is deliberately the smallest term and contributes 0 unless BOTH sides
-- turned member_match_prefs.astrology_opt_in on and have a parseable birth date, so
-- it can never become a headline. Fair-Housing: nothing here filters on protected
-- traits; gender/age captured on the seeker form are NOT read by the score.
--
-- Reuses the existing substrate verbatim: resonance_neighbors() (symmetric cosine),
-- resonance_consent (opt-in gate), profiles/listings geocells. Coordinates never
-- leave the DB — only a coarse city + a 0..1 score band are returned. Astrology math
-- mirrors lib/astrology/signs.ts exactly (element model + modality / same-sign tweaks).
-- =============================================================================

-- ── Pure astrology helpers (mirror lib/astrology/signs.ts) ───────────────────

-- Fail-safe date parse: a malformed birth_data string yields NULL, never an error
-- that would abort the whole ranking query.
create or replace function public.housing_safe_date(t text)
returns date language plpgsql immutable as $$
begin
  return t::date;
exception when others then
  return null;
end;
$$;

-- Fail-safe int parse for jsonb reads.
create or replace function public.housing_safe_int(t text)
returns int language plpgsql immutable as $$
begin
  return t::int;
exception when others then
  return null;
end;
$$;

-- Sun sign for a birth date. Western tropical cutoffs; anything before Jan 20 or on/
-- after Dec 22 is Capricorn (wraps the year). Matches signs.ts SIGN_CUTOFFS.
create or replace function public.housing_sun_sign(d date)
returns text language sql immutable as $$
  select case
    when d is null then null
    else (
      select case
        when v >= 1222 then 'capricorn'
        when v >= 1122 then 'sagittarius'
        when v >= 1023 then 'scorpio'
        when v >= 923  then 'libra'
        when v >= 823  then 'virgo'
        when v >= 723  then 'leo'
        when v >= 621  then 'cancer'
        when v >= 521  then 'gemini'
        when v >= 420  then 'taurus'
        when v >= 321  then 'aries'
        when v >= 219  then 'pisces'
        when v >= 120  then 'aquarius'
        else 'capricorn'
      end
      from (select extract(month from d)::int * 100 + extract(day from d)::int as v) x
    )
  end
$$;

create or replace function public.housing_sign_element(s text)
returns text language sql immutable as $$
  select case s
    when 'aries' then 'fire'  when 'leo' then 'fire'   when 'sagittarius' then 'fire'
    when 'taurus' then 'earth' when 'virgo' then 'earth' when 'capricorn' then 'earth'
    when 'gemini' then 'air'   when 'libra' then 'air'   when 'aquarius' then 'air'
    when 'cancer' then 'water' when 'scorpio' then 'water' when 'pisces' then 'water'
  end
$$;

create or replace function public.housing_sign_modality(s text)
returns text language sql immutable as $$
  select case s
    when 'aries' then 'cardinal' when 'cancer' then 'cardinal' when 'libra' then 'cardinal' when 'capricorn' then 'cardinal'
    when 'taurus' then 'fixed'   when 'leo' then 'fixed'       when 'scorpio' then 'fixed'   when 'aquarius' then 'fixed'
    when 'gemini' then 'mutable' when 'virgo' then 'mutable'   when 'sagittarius' then 'mutable' when 'pisces' then 'mutable'
  end
$$;

-- Element base compatibility, symmetric, matching signs.ts ELEMENT_PAIR.
create or replace function public.housing_element_pair(a text, b text)
returns double precision language sql immutable as $$
  select case
    when a is null or b is null then 0.5
    when a = b then 0.85
    when (a='fire' and b='air') or (a='air' and b='fire') then 0.9
    when (a='earth' and b='water') or (a='water' and b='earth') then 0.9
    when (a='air' and b='water') or (a='water' and b='air') then 0.5
    when (a='fire' and b='earth') or (a='earth' and b='fire') then 0.45
    when (a='air' and b='earth') or (a='earth' and b='air') then 0.45
    when (a='fire' and b='water') or (a='water' and b='fire') then 0.4
    else 0.5
  end
$$;

-- Sun-sign compatibility in [0,1], mirroring signCompatibility(): element base, +0.05
-- when modalities differ / -0.03 when equal, same-sign capped at 0.9. NULL if either
-- date is missing/unparseable (caller treats NULL as no signal).
create or replace function public.housing_astro_compat(a date, b date)
returns double precision language plpgsql immutable as $$
declare
  sa text; sb text; base double precision;
begin
  if a is null or b is null then return null; end if;
  sa := public.housing_sun_sign(a);
  sb := public.housing_sun_sign(b);
  if sa is null or sb is null then return null; end if;

  base := public.housing_element_pair(public.housing_sign_element(sa), public.housing_sign_element(sb));
  if public.housing_sign_modality(sa) is distinct from public.housing_sign_modality(sb)
    then base := base + 0.05;
    else base := base - 0.03;
  end if;
  if sa = sb then base := least(base + 0.04, 0.9); end if;

  return greatest(0, least(1, base));
end;
$$;

-- ── Lifestyle agreement over the seeker-form preferences jsonb ────────────────
-- 0..1 agreement across the keys BOTH parties filled: cleanliness (numeric 1..5,
-- graded by distance) + the categorical house-rule/rhythm keys (exact match). Neutral
-- 0.5 when there is nothing in common to compare (no penalty for a sparse profile).
create or replace function public.housing_lifestyle_agreement(a jsonb, b jsonb)
returns double precision language plpgsql immutable as $$
declare
  total double precision := 0;
  n int := 0;
  ca int; cb int;
  k text;
begin
  if a is null or b is null then return 0.5; end if;

  if (a ? 'cleanliness') and (b ? 'cleanliness') then
    ca := public.housing_safe_int(a->>'cleanliness');
    cb := public.housing_safe_int(b->>'cleanliness');
    if ca is not null and cb is not null then
      total := total + (1 - least(1, abs(ca - cb) / 4.0));
      n := n + 1;
    end if;
  end if;

  foreach k in array array['social_level','schedule','diet','pets','smoking','cannabis'] loop
    if (a ? k) and (b ? k) then
      total := total + (case when (a->>k) = (b->>k) then 1 else 0 end);
      n := n + 1;
    end if;
  end loop;

  if n = 0 then return 0.5; end if;
  return greatest(0, least(1, total / n));
end;
$$;

-- ── Roommate compatibility v2: seeker → roommate-listing owners ───────────────
-- Same signature + return shape as the original (the roommates page is unchanged),
-- now with the timing + lifestyle + astrology terms folded in. The owner's lifestyle
-- is read from their OWN seeker profile when they have one, else neutral.
create or replace function public.housing_match_candidates(_limit int default 20)
returns table (
  listing_id   uuid,
  owner_id     uuid,
  resonance    double precision,
  rent_cents   integer,
  city         text,
  score        double precision
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
      + 0.20 * case
                 when me.budget_max_cents is null or h.rent_cents is null then 0.5
                 when h.rent_cents <= me.budget_max_cents
                      and (me.budget_min_cents is null or h.rent_cents >= me.budget_min_cents) then 1.0
                 when h.rent_cents <= me.budget_max_cents then 0.8
                 else 0.0 end
      + 0.15 * case
                 when l.geocell_lat is null or me.glat is null then 0.3
                 when abs(l.geocell_lat - me.glat) < 0.2 and abs(l.geocell_lng - me.glng) < 0.2 then 1.0
                 else 0.4 end
      + 0.10 * case
                 when h.available_from is null or me.move_in_from is null then 0.5
                 else greatest(0, 1 - least(1, abs(h.available_from - me.move_in_from) / 60.0)) end
      + 0.15 * public.housing_lifestyle_agreement(me.prefs, os.preferences)
      + 0.05 * case
                 when me.astro_in is true and omp.astrology_opt_in is true
                   then coalesce(public.housing_astro_compat(me.birth, public.housing_safe_date(omp.birth_data->>'date')), 0)
                 else 0 end
    )) as score
  from public.listings l
  join public.housing_listings h on h.listing_id = l.id and h.listing_type = 'roommate'
  cross join me
  left join neighbors nb on nb.owner_id = l.owner_profile_id
  left join public.housing_seeker_profiles os on os.profile_id = l.owner_profile_id
  left join public.member_match_prefs omp on omp.profile_id = l.owner_profile_id
  where exists (select 1 from gate)
    and l.status = 'active'
    and l.owner_profile_id is distinct from me.id
  order by score desc
  limit greatest(1, least(100, coalesce(_limit, 20)));
$$;

comment on function public.housing_match_candidates(int) is
  'Consent-gated roommate compatibility v2: resonance 0.35 + budget 0.20 + geo 0.15 + timing 0.10 + lifestyle 0.15 + astrology 0.05 (sun-sign, both-opted-in only). Coordinates never returned. ADR-39Y Phase 3.';

-- ── Roommate <-> roommate: rank other ACTIVE seekers against the caller ───────
-- Symmetric via the cosine resonance (resonance_neighbors is direction-independent).
-- Caller consent gate is identical to housing_match_candidates. Additionally, the
-- OTHER seeker must be in the matching pool (opted in, not opted out as a target)
-- before we ever reveal them — a seeker profile is private, so surfacing one requires
-- that member's own consent (the reciprocal, resonate-don't-extract stance). Returns
-- the coarse search city + a 0..1 score band only; never coordinates.
create or replace function public.housing_roommate_matches(_limit int default 20)
returns table (
  profile_id uuid,
  resonance  double precision,
  city       text,
  score      double precision
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
      + 0.20 * case
                 when me.budget_max_cents is null or o.budget_max_cents is null then 0.5
                 when greatest(coalesce(me.budget_min_cents, 0), coalesce(o.budget_min_cents, 0))
                      <= least(me.budget_max_cents, o.budget_max_cents) then 1.0
                 else 0.0 end
      + 0.15 * case
                 when me.search_lat is null or o.search_lat is null then 0.3
                 when abs(round(me.search_lat::numeric, 2) - round(o.search_lat::numeric, 2)) < 0.2
                      and abs(round(me.search_lng::numeric, 2) - round(o.search_lng::numeric, 2)) < 0.2 then 1.0
                 else 0.4 end
      + 0.10 * case
                 when me.move_in_from is null or o.move_in_from is null then 0.5
                 else greatest(0, 1 - least(1, abs(o.move_in_from - me.move_in_from) / 60.0)) end
      + 0.15 * public.housing_lifestyle_agreement(me.prefs, o.preferences)
      + 0.05 * case
                 when me.astro_in is true and omp.astrology_opt_in is true
                   then coalesce(public.housing_astro_compat(me.birth, public.housing_safe_date(omp.birth_data->>'date')), 0)
                 else 0 end
    )) as score
  from public.housing_seeker_profiles o
  cross join me
  join public.resonance_consent oc
    on oc.profile_id = o.profile_id and oc.opted_in = true and coalesce(oc.opted_out_as_target, false) = false
  left join neighbors nb on nb.profile_id = o.profile_id
  left join public.member_match_prefs omp on omp.profile_id = o.profile_id
  where exists (select 1 from gate)
    and o.active = true
    and o.profile_id is distinct from me.id
  order by score desc
  limit greatest(1, least(100, coalesce(_limit, 20)));
$$;

comment on function public.housing_roommate_matches(int) is
  'Consent-gated roommate<->roommate ranking: other ACTIVE, opted-in seekers scored against the caller with the same v2 blend (resonance/budget/geo/timing/lifestyle/astrology). Symmetric via cosine resonance. Returns coarse city + score band only, never coordinates. ADR-39Y Phase 3.';

-- Rollback (manual):
--   drop function if exists public.housing_roommate_matches(int);
--   -- housing_match_candidates(int) reverts to the Phase-2 body in 20260815000300.
--   drop function if exists public.housing_astro_compat(date,date), public.housing_lifestyle_agreement(jsonb,jsonb),
--     public.housing_sun_sign(date), public.housing_sign_element(text), public.housing_sign_modality(text),
--     public.housing_element_pair(text,text), public.housing_safe_date(text), public.housing_safe_int(text);
