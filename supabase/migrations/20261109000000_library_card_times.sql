-- Library card times (ADR-109 follow-up) — the community_library RPC learns the
-- per-item TIME data the Library cards show:
--
--   · duration_min / cadence — a Practice's session length + rhythm
--     ("10 min · Daily"), straight off practices.duration_min / practices.cadence.
--   · unit_count / unit_label — a Journey's structural size, derived from its
--     block tree (journey_plan_items): weekly Phases ≈ weeks, and every
--     non-phase/non-module block is a fillable lesson/step. unit_label carries
--     the pluralized descriptor ("weeks · 24 lessons" / "lessons"), so the card
--     renders `unit_count || ' ' || unit_label` as one chip. NULL when the plan
--     has no items yet.
--   · Programs carry no time — all four are NULL.
--
-- Postgres cannot change a RETURNS TABLE signature via CREATE OR REPLACE, so the
-- function is DROPped and re-created with the four TRAILING columns appended
-- (existing callers that read the original columns by name are unaffected), and
-- the REVOKE/GRANT block is re-issued. The app code FAILS SAFE either way: the
-- mapper treats the columns as null when absent, so it deploys before or after
-- this migration runs.

drop function if exists public.community_library(text, text, int);

create function public.community_library(
  _type   text default null,   -- 'practice' | 'program' | 'journey' | null (all)
  _pillar text default null,
  _limit  int  default 80
)
returns table (
  content_type text, id uuid, slug text, title text, summary text, pillar text,
  author_id uuid, cover_image text, created_at timestamptz,
  adoptions int, completions int, ratings int, score numeric,
  duration_min int, cadence text, unit_count int, unit_label text
)
language sql stable security definer set search_path = public
as $$
  with rows as (
    select 'practice'::text as content_type, p.id, p.id::text as slug, p.title,
           p.description as summary, null::text as pillar, p.created_by as author_id,
           null::text as cover_image, p.created_at, p.reviewed_by,
           (select count(*) from member_practices mp where mp.practice_id = p.id and mp.active)::int as adoptions,
           (select count(*) from practice_logs pl where pl.practice_id = p.id)::int as completions,
           p.duration_min, p.cadence,
           null::int as unit_count, null::text as unit_label
    from practices p
    where p.status = 'approved' and p.is_public
    union all
    select 'program', pr.id, pr.slug, pr.title, pr.summary, pr.pillar, pr.author_id,
           pr.cover_image, pr.created_at, pr.reviewed_by,
           pr.adopt_count::int,
           (select count(*) from program_adoptions pa where pa.program_id = pr.id)::int,
           null::int, null::text, null::int, null::text
    from programs pr
    where pr.status = 'approved'
    union all
    select 'journey', jp.id, jp.slug, jp.title, jp.summary, null, jp.author_id,
           jp.cover_image, jp.created_at, jp.reviewed_by,
           jp.adopt_count::int,
           (select count(*) from journey_plan_adoptions ja where ja.plan_id = jp.id and ja.active)::int,
           null::int, null::text,
           js.unit_count, js.unit_label
    from journey_plans jp
    -- The block-tree size (mirrors getMyPlanSummaries in lib/journey-plans.ts):
    -- phases = top-level weekly Phases; steps = every block that isn't a phase or a
    -- module (legacy rows with NULL block_type are 'practice' steps).
    cross join lateral (
      select
        case when c.phases > 0 then c.phases when c.steps > 0 then c.steps else null end::int as unit_count,
        case
          when c.phases > 0 and c.steps > 0 then
            (case when c.phases = 1 then 'week' else 'weeks' end)
            || ' · ' || c.steps || (case when c.steps = 1 then ' lesson' else ' lessons' end)
          when c.phases > 0 then case when c.phases = 1 then 'week' else 'weeks' end
          when c.steps  > 0 then case when c.steps  = 1 then 'lesson' else 'lessons' end
          else null
        end as unit_label
      from (
        select
          count(*) filter (where ji.block_type = 'phase') as phases,
          count(*) filter (where coalesce(ji.block_type, 'practice') not in ('phase', 'module')) as steps
        from journey_plan_items ji
        where ji.plan_id = jp.id
      ) c
    ) js
    where jp.status = 'approved' and jp.visibility = 'public'
  ),
  scored as (
    select r.content_type, r.id, r.slug, r.title, r.summary, r.pillar, r.author_id,
           r.cover_image, r.created_at, r.adoptions, r.completions,
           r.duration_min, r.cadence, r.unit_count, r.unit_label,
           (select count(*) from content_ratings cr where cr.content_type = r.content_type and cr.content_id = r.id)::int as ratings,
           -- endorser rank order (1=ghost ... 4=master, the completion canon), 0 if unreviewed
           case rv.current_season_rank
             when 'master' then 4 when 'adept' then 3 when 'initiate' then 2
             when 'ghost' then 1 else 0
           end as endorser_order
    from rows r
    left join profiles rv on rv.id = r.reviewed_by
  )
  select content_type, id, slug, title, summary, pillar, author_id, cover_image, created_at,
         adoptions, completions, ratings,
         round(
           3.0 * adoptions
         + 2.0 * completions
         + 4.0 * ratings
         + greatest(0, 14 - (extract(epoch from (now() - created_at)) / 86400.0)) * 0.7  -- recency, 0–~10
         + endorser_order * 0.8                                                           -- endorser rank, 0–~5
         , 2) as score,
         duration_min, cadence, unit_count, unit_label
  from scored
  where (_type is null or content_type = _type)
    and (_pillar is null or pillar = _pillar)
  order by score desc, created_at desc
  limit greatest(1, least(coalesce(_limit, 80), 200));
$$;

revoke all on function public.community_library(text, text, int) from public, anon;
grant execute on function public.community_library(text, text, int) to authenticated, service_role;
