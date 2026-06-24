-- Resonance Engine Phase 4 (ADR-385 - docs/NEXT-GEN-CRM.md "The Resonance Graph" -> "Embedding
-- retrieval"). The BEST-EFFORT content layer over the reliable graph-traversal baseline: one 384-d
-- gte-small resonance embedding per person (built from the Pillars / Journeys / practices they
-- engage), plus an ANN index and a cosine-search RPC. The code (lib/resonance/embeddings.ts) is
-- FAIL-SAFE: until this migration applies + pgvector is enabled, every embedding read/write degrades
-- to a no-op and the engine runs on graph-traversal candidates only. The embedding is purely
-- additive precision, never a dependency.
--
-- Embedding dim is 384 (gte-small via the `embed` edge function, NOT 1536); the hnsw
-- vector_cosine_ops index mirrors event_embeddings (20260610020000) + room_messages (20260606120000).
--
-- ACCESS: server / service-role only. RLS ON, NO client policy, exactly like every other
-- embedding-backed / AI-derived table. The cosine-search RPC is SECURITY DEFINER, service-role only,
-- and gated at its call site (the consent- + staff-scoped match read).
--
-- House style: additive + idempotent; applied via the Supabase SQL editor; reached untyped until
-- lib/database.types.ts regenerates (ADR-246). No em or en dashes in any copy here.

create extension if not exists vector;

-- ── resonance_embeddings ─────────────────────────────────────────────────────────────────────────
create table if not exists public.resonance_embeddings (
  profile_id uuid        primary key references public.profiles(id) on delete cascade,
  embedding  vector(384),
  updated_at timestamptz not null default now()
);

create index if not exists resonance_embeddings_embedding_idx
  on public.resonance_embeddings using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

comment on table public.resonance_embeddings is
  '384-d gte-small resonance embedding per person (Pillars + Journeys + practices) powering the best-effort embedding-retrieval half of the Resonance Graph (ADR-385). Server/service-role only; refreshed by the nightly resonance step. Fail-safe: absent until the migration applies; the engine degrades to graph-traversal candidates.';

alter table public.resonance_embeddings enable row level security;
-- No SELECT/INSERT/UPDATE/DELETE policy on purpose: deny all client access. Only the service role
-- (which bypasses RLS) reads/writes, exactly like event_embeddings.

-- ── resonance_neighbors: the cosine-search RPC ─────────────────────────────────────────────────────
-- The top-K nearest neighbours of a person by cosine similarity over the ANN index. Returns the
-- similarity as 1 - cosine_distance, clamped into [0, 1] by the caller. SECURITY DEFINER so it reads
-- the embeddings regardless of the caller's RLS context; the consent + staff gate lives at the call
-- site (lib/resonance/candidates.ts). Excludes the anchor itself. Fail-safe: an absent anchor row
-- yields no rows.
create or replace function public.resonance_neighbors(_profile_id uuid, _limit int default 20)
returns table (profile_id uuid, similarity double precision)
language sql
security definer
set search_path = public
as $$
  with anchor as (
    select embedding from public.resonance_embeddings where profile_id = _profile_id and embedding is not null
  )
  select e.profile_id,
         1 - (e.embedding <=> a.embedding) as similarity
  from public.resonance_embeddings e
  cross join anchor a
  where e.profile_id <> _profile_id
    and e.embedding is not null
  order by e.embedding <=> a.embedding
  limit greatest(1, least(100, coalesce(_limit, 20)));
$$;

revoke all on function public.resonance_neighbors(uuid, int) from public;
grant execute on function public.resonance_neighbors(uuid, int) to service_role;
grant select on public.resonance_embeddings to service_role;

-- Rollback:
--   drop function if exists public.resonance_neighbors(uuid, int);
--   drop table if exists public.resonance_embeddings;  -- drops its index with it.
--   -- leave the `vector` extension in place (shared with event_embeddings).
