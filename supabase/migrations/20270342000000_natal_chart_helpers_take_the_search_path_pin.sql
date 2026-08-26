-- =============================================================================
-- Pin search_path on the three natal-chart synastry helpers (SCAN-520).
--
-- The pure helpers introduced in 20270326000000 (natal chart matching, ADR-1138)
-- were created WITHOUT `set search_path`, which trips the Supabase
-- `function_search_path_mutable` advisor. This is the SAME omission
-- 20261134000000 exists to correct for housing_safe_date / housing_safe_int, in
-- the same function family: 20270326000000's own comment cites those two as the
-- pattern it follows, then leaves out the one thing that migration was written
-- to add.
--
-- Not exploitable, and the row said so: all three are SECURITY INVOKER (not
-- DEFINER), EXECUTE is revoked from public / anon / authenticated by name
-- (ADR-959), and every cross-call is already schema-qualified with `public.`.
-- They run only inside the SECURITY DEFINER match RPCs. Pinning clears the
-- advisor and restores the family convention.
--
-- THIS FILE IS A RECOVERY, and the recovery is the point. The DDL below was
-- applied to production ahead of the file, leaving one ledger row
-- (20270342000000) with no repo file: production ran SQL the tree could not
-- reproduce, and `check:migrations` fails from that side until the file lands.
-- The statements here are recovered VERBATIM from the ledger's own `statements`
-- column, so the tree and the applied schema are byte-identical rather than
-- merely equivalent. See docs/DATABASE.md, ADR-1111: the file and the apply
-- travel together.
--
-- CREATE OR REPLACE only: same signatures, same bodies, adds
-- `set search_path = public`. The revokes are re-stated defensively.
-- Additive + idempotent, SAFE to re-run. No em or en dashes.
-- =============================================================================

create or replace function public.housing_safe_float(t text)
returns double precision language plpgsql immutable set search_path = public as $$
begin
  return t::double precision;
exception when others then
  return null;
end;
$$;

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

revoke execute on function public.housing_safe_float(text) from public, anon, authenticated;
revoke execute on function public.housing_aspect_score(double precision, double precision) from public, anon, authenticated;
revoke execute on function public.housing_natal_compat(jsonb, jsonb) from public, anon, authenticated;
