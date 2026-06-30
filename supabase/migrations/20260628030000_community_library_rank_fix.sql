-- Fix community_library() — the endorser-rank CASE still referenced the RETIRED
-- 6-rank Zap ladder (Runner/Operative/Agent/Conduit/Luminary, see NAMING.md §"Retired").
-- The live `season_rank_enum` is now the 4 completion-based ranks
-- (Ghost → Initiate → Adept → Master, NAMING.md §"Season ranks"). Comparing the enum
-- column to a string that is NOT a member of the enum (e.g. 'luminary') makes Postgres
-- fail the implicit cast at function startup, so the WHOLE function errored out and the
-- Library page fell back to its empty state — even with approved, public content present.
--
-- Re-create the function unchanged except the CASE, remapped to the current ranks:
-- ghost 1 → initiate 2 → adept 3 → master 4 (unreviewed = 0). Pure read, no data change.
create or replace function public.community_library(
  _type   text default null,   -- 'practice' | 'program' | 'journey' | null (all)
  _pillar text default null,
  _limit  int  default 80
)
returns table (
  content_type text, id uuid, slug text, title text, summary text, pillar text,
  author_id uuid, cover_image text, created_at timestamptz,
  adoptions int, completions int, ratings int, score numeric
)
language sql stable security definer set search_path = public
as $$
  with rows as (
    select 'practice'::text as content_type, p.id, p.id::text as slug, p.title,
           p.description as summary, null::text as pillar, p.created_by as author_id,
           null::text as cover_image, p.created_at, p.reviewed_by,
           (select count(*) from member_practices mp where mp.practice_id = p.id and mp.active)::int as adoptions,
           (select count(*) from practice_logs pl where pl.practice_id = p.id)::int as completions
    from practices p
    where p.status = 'approved' and p.is_public
    union all
    select 'program', pr.id, pr.slug, pr.title, pr.summary, pr.pillar, pr.author_id,
           pr.cover_image, pr.created_at, pr.reviewed_by,
           pr.adopt_count::int,
           (select count(*) from program_adoptions pa where pa.program_id = pr.id)::int
    from programs pr
    where pr.status = 'approved'
    union all
    select 'journey', jp.id, jp.slug, jp.title, jp.summary, null, jp.author_id,
           jp.cover_image, jp.created_at, jp.reviewed_by,
           jp.adopt_count::int,
           (select count(*) from journey_plan_adoptions ja where ja.plan_id = jp.id and ja.active)::int
    from journey_plans jp
    where jp.status = 'approved' and jp.visibility = 'public'
  ),
  scored as (
    select r.content_type, r.id, r.slug, r.title, r.summary, r.pillar, r.author_id,
           r.cover_image, r.created_at, r.adoptions, r.completions,
           (select count(*) from content_ratings cr where cr.content_type = r.content_type and cr.content_id = r.id)::int as ratings,
           -- endorser rank order (1=ghost … 4=master), 0 if unreviewed
           case rv.current_season_rank
             when 'master' then 4 when 'adept' then 3 when 'initiate' then 2 when 'ghost' then 1 else 0
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
         + endorser_order * 0.8                                                           -- endorser rank, 0–~3
         , 2) as score
  from scored
  where (_type is null or content_type = _type)
    and (_pillar is null or pillar = _pillar)
  order by score desc, created_at desc
  limit greatest(1, least(coalesce(_limit, 80), 200));
$$;

revoke all on function public.community_library(text, text, int) from public, anon;
grant execute on function public.community_library(text, text, int) to authenticated, service_role;
