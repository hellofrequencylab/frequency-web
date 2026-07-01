-- The Loom — semantic search Phase 1 (docs/RESEARCH-ASSET-GEN.md). Reuses the gte-small
-- `embed` edge function + the match_room_messages / match_help_chunks pattern (384-d, key-free,
-- no vendor). The `embedding vector(384)` column already exists (20260919000000_library_assets.sql,
-- reserved); this adds the content-hash gate, the HNSW index, and the two search RPCs.
-- Service-role only (callers gate via requireAdmin). Applied to prod via MCP; committed for parity.
create extension if not exists vector;

-- Skip re-embedding assets whose embed-source text is unchanged.
alter table public.library_assets add column if not exists embedding_hash text;

create index if not exists library_assets_embedding_idx
  on public.library_assets using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

-- Semantic search within a space: nearest assets to a query embedding. Space-scoped, live only.
create or replace function public.match_library_assets(
  query_embedding vector(384),
  p_space_id uuid,
  match_count int default 48,
  p_kind text default null
)
returns table (id uuid, similarity float)
language sql stable security definer set search_path = public as $$
  select a.id, 1 - (a.embedding <=> query_embedding) as similarity
  from public.library_assets a
  where a.space_id = p_space_id
    and a.embedding is not null
    and a.status <> 'archived'
    and (p_kind is null or a.kind = p_kind)
  order by a.embedding <=> query_embedding
  limit greatest(1, least(match_count, 200));
$$;

-- "Find similar": nearest assets to a given one (same space, excluding itself).
create or replace function public.similar_library_assets(
  p_asset_id uuid,
  match_count int default 24
)
returns table (id uuid, similarity float)
language sql stable security definer set search_path = public as $$
  with src as (
    select embedding, space_id from public.library_assets where id = p_asset_id
  )
  select a.id, 1 - (a.embedding <=> src.embedding) as similarity
  from public.library_assets a, src
  where src.embedding is not null
    and a.space_id = src.space_id
    and a.id <> p_asset_id
    and a.embedding is not null
    and a.status <> 'archived'
  order by a.embedding <=> src.embedding
  limit greatest(1, least(match_count, 200));
$$;

revoke all on function public.match_library_assets(vector, uuid, int, text) from public, anon;
revoke all on function public.similar_library_assets(uuid, int) from public, anon;
grant execute on function public.match_library_assets(vector, uuid, int, text) to service_role;
grant execute on function public.similar_library_assets(uuid, int) to service_role;
