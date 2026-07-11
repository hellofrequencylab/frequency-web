-- =============================================================================
-- Harden the housing matching v2 helper functions with a pinned search_path.
--
-- The pure helpers introduced in 20261133000000 (safe-parse, sun-sign, element /
-- modality, element-pair, astro-compat, lifestyle-agreement) were created WITHOUT
-- `set search_path`, which trips the Supabase `function_search_path_mutable` advisor.
-- They do no table access and fully-qualify every cross-call with `public.`, so the
-- mutable path is not exploitable, but pinning it clears the advisor and matches the
-- two RPCs (which already set `search_path = public`).
--
-- CREATE OR REPLACE only: same signatures, same bodies, adds `set search_path = public`.
-- Additive + idempotent, SAFE to re-run. No em or en dashes.
-- =============================================================================

create or replace function public.housing_safe_date(t text)
returns date language plpgsql immutable set search_path = public as $$
begin
  return t::date;
exception when others then
  return null;
end;
$$;

create or replace function public.housing_safe_int(t text)
returns int language plpgsql immutable set search_path = public as $$
begin
  return t::int;
exception when others then
  return null;
end;
$$;

create or replace function public.housing_sun_sign(d date)
returns text language sql immutable set search_path = public as $$
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
returns text language sql immutable set search_path = public as $$
  select case s
    when 'aries' then 'fire'  when 'leo' then 'fire'   when 'sagittarius' then 'fire'
    when 'taurus' then 'earth' when 'virgo' then 'earth' when 'capricorn' then 'earth'
    when 'gemini' then 'air'   when 'libra' then 'air'   when 'aquarius' then 'air'
    when 'cancer' then 'water' when 'scorpio' then 'water' when 'pisces' then 'water'
  end
$$;

create or replace function public.housing_sign_modality(s text)
returns text language sql immutable set search_path = public as $$
  select case s
    when 'aries' then 'cardinal' when 'cancer' then 'cardinal' when 'libra' then 'cardinal' when 'capricorn' then 'cardinal'
    when 'taurus' then 'fixed'   when 'leo' then 'fixed'       when 'scorpio' then 'fixed'   when 'aquarius' then 'fixed'
    when 'gemini' then 'mutable' when 'virgo' then 'mutable'   when 'sagittarius' then 'mutable' when 'pisces' then 'mutable'
  end
$$;

create or replace function public.housing_element_pair(a text, b text)
returns double precision language sql immutable set search_path = public as $$
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

create or replace function public.housing_astro_compat(a date, b date)
returns double precision language plpgsql immutable set search_path = public as $$
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

create or replace function public.housing_lifestyle_agreement(a jsonb, b jsonb)
returns double precision language plpgsql immutable set search_path = public as $$
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
