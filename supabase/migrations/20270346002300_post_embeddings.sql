-- The feed can tell what a post is about: post-content embeddings and an interest score (LIVE-677).
-- See docs/BUILD-BACKLOG.json for status; this file explains the work, it does not track it.
--
-- lib/feed/blend-rank.ts carried "interest · folded into `graph` for now; post-content embeddings
-- land later". This is the later. It mirrors event_embeddings (20260610020000) exactly:
--
-- 1. public.post_embeddings: one 384-d gte-small vector per top-level post (the post body),
--    written by the embed-posts cron (lib/feed/post-embeddings.ts). RLS ON with NO client policy:
--    service role only, like every embedding-backed table. hnsw cosine index for parity.
-- 2. public.post_interest_scores(viewer, post_ids): for the posts a feed render is ABOUT TO SHOW
--    (ids the caller already read through RLS), how close each post is to what this viewer engages
--    with. The viewer's interest is the centroid of the vectors of posts they recently reacted to,
--    replied to, or wrote (newest 100, last 180 days). Returns 1 - cosine distance per post that
--    has a vector; posts without one, or a viewer with no engagement yet, return no row and the
--    blend drops the term for them (fail-safe, never a penalty). SECURITY DEFINER because it reads
--    the service-only table; execute is SERVICE ROLE ONLY, since it takes any viewer id, and the
--    caller (lib/feed/post-interest.ts) passes the signed-in viewer's own id.
--
-- Additive and idempotent. ROLLBACK:
--   drop function if exists public.post_interest_scores(uuid, uuid[]);
--   drop table if exists public.post_embeddings;

create extension if not exists vector;

create table if not exists public.post_embeddings (
  post_id    uuid        primary key references public.posts (id) on delete cascade,
  embedding  vector(384),
  updated_at timestamptz not null default now()
);

create index if not exists post_embeddings_embedding_idx
  on public.post_embeddings using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

comment on table public.post_embeddings is
  '384-d gte-small embedding per top-level post (its body) for the feed interest signal (LIVE-677). Service-role only; written by the embed-posts cron.';

alter table public.post_embeddings enable row level security;
-- No policy on purpose: deny all client access; the service role bypasses RLS.

create or replace function public.post_interest_scores(p_viewer uuid, p_post_ids uuid[])
returns table (post_id uuid, similarity double precision)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with engaged as (
    select x.post_id from (
      select r.post_id, r.created_at from public.post_reactions r
        where r.profile_id = p_viewer and r.created_at > now() - interval '180 days'
      union all
      select coalesce(p.parent_id, p.id), p.created_at from public.posts p
        where p.author_id = p_viewer and p.created_at > now() - interval '180 days'
    ) x
    order by x.created_at desc
    limit 100
  ),
  centroid as (
    select avg(e.embedding) as v
    from public.post_embeddings e
    where e.post_id in (select post_id from engaged) and e.embedding is not null
  )
  select e.post_id, 1 - (e.embedding <=> c.v) as similarity
  from public.post_embeddings e
  cross join centroid c
  where c.v is not null
    and e.embedding is not null
    and e.post_id = any ((coalesce(p_post_ids, '{}'::uuid[]))[1:200]);
$$;

revoke execute on function public.post_interest_scores(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.post_interest_scores(uuid, uuid[]) to service_role;
grant select, insert, update, delete on public.post_embeddings to service_role;
