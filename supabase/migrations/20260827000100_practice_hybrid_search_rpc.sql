-- =============================================================================
-- Practice library Phase 1 — hybrid retrieval RPC (ADR-438, PRACTICE-LIBRARY.md §5).
--
-- Fuses the two Phase-1 signals with Reciprocal Rank Fusion (RRF), Postgres-native,
-- no external engine:
--   • full-text  — search_vector (GIN) ranked by ts_rank over websearch_to_tsquery
--   • vector     — embedding (HNSW) ranked by cosine distance (<=>)
-- RRF score for a row = Σ 1/(k + rank_in_list) across the lists it appears in (k=60 is
-- the standard constant). A row strong in either signal surfaces; strong in both wins.
--
-- Either input may be null: text-only (no embedding yet → behaves like full-text),
-- vector-only (no query text → semantic neighbours), or both (true hybrid). Returns ids
-- + the fused score + each per-list rank (null when absent), newest-tie-broken by score.
-- The caller (lib/practices.ts) hydrates the rows from practices_ranked.
--
-- SECURITY: SECURITY DEFINER with search_path pinned to public (advisor:
-- function_search_path_mutable). Inputs are parameterized — websearch_to_tsquery
-- sanitizes the text, the embedding is a typed vector(384) — so no injection surface.
-- Archived + (unless include_hidden) non-public rows are excluded inside the function.
-- Grants mirror match_practices: authenticated (member /discover search) + service_role
-- (admin workspace); never anon/public.
--
-- IDEMPOTENT: create-or-replace. Apply on a branch, then merge (apply-on-merge gate).
-- =============================================================================

create or replace function public.search_practices_hybrid(
  query_text text default null,
  query_embedding vector(384) default null,
  match_limit int default 50,
  rrf_k int default 60,
  include_hidden boolean default false
)
returns table (
  id uuid,
  rrf_score double precision,
  fts_rank int,
  vec_rank int
)
language sql
stable
security definer
set search_path = public
as $$
  with bounded as (
    select greatest(1, least(coalesce(match_limit, 50), 200)) as lim,
           greatest(1, coalesce(rrf_k, 60)) as k,
           nullif(btrim(coalesce(query_text, '')), '') as qt
  ),
  fts as (
    select p.id,
           row_number() over (
             order by ts_rank(p.search_vector, websearch_to_tsquery('english', b.qt)) desc, p.created_at desc
           )::int as rnk
    from public.practices p
    cross join bounded b
    where b.qt is not null
      and p.search_vector @@ websearch_to_tsquery('english', b.qt)
      and p.status <> 'archived'
      and (include_hidden or p.is_public)
    limit (select lim from bounded)
  ),
  vec as (
    select p.id,
           row_number() over (order by p.embedding <=> query_embedding)::int as rnk
    from public.practices p
    where query_embedding is not null
      and p.embedding is not null
      and p.status <> 'archived'
      and (include_hidden or p.is_public)
    limit (select lim from bounded)
  ),
  fused as (
    select coalesce(f.id, v.id) as id,
           coalesce(1.0 / ((select k from bounded) + f.rnk), 0.0)
             + coalesce(1.0 / ((select k from bounded) + v.rnk), 0.0) as rrf_score,
           f.rnk as fts_rank,
           v.rnk as vec_rank
    from fts f
    full outer join vec v on v.id = f.id
  )
  select id, rrf_score, fts_rank, vec_rank
  from fused
  order by rrf_score desc, id
  limit (select lim from bounded);
$$;

-- service_role ONLY: the include_hidden escape hatch would leak non-public practice ids to any
-- authenticated caller, and Phase 1's only consumer is the admin workspace (service role). A
-- hardened, is_public-locked variant is the move when member-facing hybrid search is wired.
revoke all on function public.search_practices_hybrid(text, vector, int, int, boolean) from public, anon, authenticated;
grant execute on function public.search_practices_hybrid(text, vector, int, int, boolean) to service_role;

comment on function public.search_practices_hybrid is
  'Phase-1 hybrid practice retrieval (ADR-438): RRF fusion of full-text (search_vector) + vector (embedding) ranks. Either input may be null. Excludes archived + (unless include_hidden) non-public. Caller hydrates ids from practices_ranked.';
