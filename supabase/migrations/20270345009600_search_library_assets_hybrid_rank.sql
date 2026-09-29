-- ============================================================================
-- MOST RELEVANT RANKS MEANING AND WORDS IN ONE QUERY (LIVE-586, ADR-1597, 2026-09-29)
-- ============================================================================
--
-- THE DEFECT. The Loom Studio's "Most relevant" sort called match_library_assets
-- (20260921000000): cosine distance over the embedding and nothing else. When that
-- returned nothing (AI off, over budget, nothing embedded) the page fell back to the
-- OTHER ranker, the in-process FTS + trigram rank in lib/library/search-rank.ts. The
-- two never met, so a person got meaning OR words:
--   * an asset whose title IS the query ranked wherever its embedding happened to land,
--     behind any vague semantic neighbour;
--   * a misspelt query got meaning from the misspelling and no help from the letters.
--
-- ADR-1121 scoped this function and deliberately did not build it, because PostgREST
-- cannot `order by ts_rank(...)` (a rank is not a column) and an RPC is a migration.
-- ADR-1563 (the PROG-D7 decomposition) filed it as this row with this stamp.
--
-- THE FUNCTION. public.search_library_assets ranks three arms and fuses them by
-- reciprocal rank fusion, score = sum over arms of 1 / (60 + rank_in_arm):
--   fts   search_tsv @@ websearch_to_tsquery('english', q), ordered by ts_rank. Stemmed,
--         whole words: "running" finds "run".
--   trgm  the title by trigram, ordered by the better of similarity() and
--         word_similarity(), then similarity() so an exact title (1.0 on both) leads.
--         Admits a title that contains the query, or scores >= 0.2 whole or >= 0.4 on
--         its best word run, so a one-letter slip ("sunest" for "Sunset", 0.27) still
--         lands. The thresholds are explicit function calls rather than the % and <%
--         operators so they do not depend on a session GUC.
--   vec   embedding <=> p_embedding (cosine), only when p_embedding is not null.
-- A row found by every arm outranks a row found by one; a row strong in one arm still
-- surfaces. With p_embedding null (AI off or over budget) the two word arms still rank,
-- which is why the Studio no longer needs a fallback for an empty result.
--
-- Scope matches match_library_assets exactly: one space, status <> 'archived', the
-- optional kind, each arm capped at 200 candidates, match_count clamped to 1..200.
-- Each arm returns its rank so the caller can order the page with the same fold
-- (lib/library/search-rank.ts fuseRankedArms, which the unit test pins).
--
-- COST. Each arm reads one space's live rows (library_assets_scope_idx on
-- (space_id, kind, status)); the largest Loom is low thousands of rows, so the trigram
-- scoring runs over that set, not the table. The vector arm is an order-by-distance
-- with a limit, the shape the HNSW index serves.
--
-- SECURITY. SECURITY INVOKER, as the row asks: the only caller is the service-role
-- admin client (lib/library/hybrid-search.ts), and library_assets is RLS-on with no
-- policy and no anon/authenticated table grant, so an invoker function adds no path a
-- browser could use. EXECUTE is still revoked from public, anon and authenticated BY
-- NAME and granted to service_role (ADR-959; the 20270221000100/000200 lesson), and the
-- verdict is `internal` in scripts/function-grants.txt. search_path is pinned and lists
-- `extensions` so similarity() and the vector operator resolve wherever pg_trgm and
-- pgvector are installed. Inputs are parameters: websearch_to_tsquery sanitises the
-- text and the ilike pattern escapes \ % and _.
--
-- WHAT IS KEPT. match_library_assets stays defined (nothing calls it after this change;
-- dropping it is its own row if wanted, the LIVE-163 shape). similar_library_assets
-- stays and still drives "Find similar". The picker's query path and the keyword sorts
-- keep rankLibraryMatches.
--
-- APPLY AFTER MERGE, never before (docs/DATABASE.md, ADR-1111). Additive and idempotent:
-- create or replace, then revoke and grant. Nothing is dropped or rewritten.
-- ============================================================================

create or replace function public.search_library_assets(
  p_space_id uuid,
  p_query text,
  p_embedding vector(384) default null,
  p_kind text default null,
  match_count int default 48
)
returns table (
  id uuid,
  rrf_score double precision,
  fts_rank int,
  trgm_rank int,
  vec_rank int
)
language sql
stable
security invoker
set search_path = public, extensions, pg_temp
as $$
  with params as (
    select
      nullif(btrim(left(coalesce(p_query, ''), 300)), '') as q,
      greatest(1, least(coalesce(match_count, 48), 200)) as lim
  ),
  words as (
    select
      p.q,
      p.lim,
      websearch_to_tsquery('english', p.q) as tsq,
      '%' || replace(replace(replace(p.q, '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
    from params p
    where p.q is not null
  ),
  fts as (
    select c.id, (row_number() over (order by c.r desc, c.created_at desc, c.id))::int as rnk
    from (
      select a.id, a.created_at, ts_rank(a.search_tsv, w.tsq) as r
      from public.library_assets a
      cross join words w
      where a.space_id = p_space_id
        and a.status <> 'archived'
        and (p_kind is null or a.kind = p_kind)
        and a.search_tsv @@ w.tsq
      order by r desc, a.created_at desc, a.id
      limit 200
    ) c
  ),
  trgm as (
    select c.id, (row_number() over (order by c.best desc, c.whole desc, c.created_at desc, c.id))::int as rnk
    from (
      select
        a.id,
        a.created_at,
        similarity(a.title, w.q) as whole,
        greatest(similarity(a.title, w.q), word_similarity(w.q, a.title)) as best
      from public.library_assets a
      cross join words w
      where a.space_id = p_space_id
        and a.status <> 'archived'
        and (p_kind is null or a.kind = p_kind)
        and (
          a.title ilike w.pat escape '\'
          or similarity(a.title, w.q) >= 0.2
          or word_similarity(w.q, a.title) >= 0.4
        )
      order by best desc, whole desc, a.created_at desc, a.id
      limit 200
    ) c
  ),
  vec as (
    select c.id, (row_number() over (order by c.dist, c.id))::int as rnk
    from (
      select a.id, a.embedding <=> p_embedding as dist
      from public.library_assets a
      where p_embedding is not null
        and a.space_id = p_space_id
        and a.embedding is not null
        and a.status <> 'archived'
        and (p_kind is null or a.kind = p_kind)
      order by a.embedding <=> p_embedding
      limit 200
    ) c
  ),
  arms as (
    select fts.id, fts.rnk, 'fts'::text as arm from fts
    union all
    select trgm.id, trgm.rnk, 'trgm'::text from trgm
    union all
    select vec.id, vec.rnk, 'vec'::text from vec
  ),
  fused as (
    select
      arms.id,
      sum(1.0::double precision / (60 + arms.rnk)) as rrf_score,
      min(arms.rnk) filter (where arms.arm = 'fts') as fts_rank,
      min(arms.rnk) filter (where arms.arm = 'trgm') as trgm_rank,
      min(arms.rnk) filter (where arms.arm = 'vec') as vec_rank
    from arms
    group by arms.id
  )
  select f.id, f.rrf_score, f.fts_rank, f.trgm_rank, f.vec_rank
  from fused f
  order by f.rrf_score desc, least(f.fts_rank, f.trgm_rank, f.vec_rank), f.id
  limit (select lim from params);
$$;

revoke all on function public.search_library_assets(uuid, text, vector, text, integer) from public, anon, authenticated;
grant execute on function public.search_library_assets(uuid, text, vector, text, integer) to service_role;

comment on function public.search_library_assets(uuid, text, vector, text, integer) is
  'Loom Most relevant (LIVE-586, ADR-1597): reciprocal rank fusion (k = 60) of a full-text arm '
  '(ts_rank over search_tsv), a title trigram arm and, when p_embedding is given, a cosine arm. '
  'One space, live rows only. Returns ids with the fused score and each arm''s rank. Service role only.';
