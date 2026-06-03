-- AI help search + usage ledger infrastructure (Phase 1, ADR-067/041).
-- Applied to the live project via MCP; this file mirrors it for repo parity.
-- Idempotent so a `supabase db push` re-run is safe.

-- 1. Help content chunks for RAG (gte-small, 384-d). Read only via the
--    match_help_chunks RPC (security definer) or the service role; RLS denies
--    direct client access.
create table if not exists public.help_chunks (
  id           uuid primary key default gen_random_uuid(),
  category     text not null,
  slug         text not null,
  heading      text not null default '',
  content      text not null,
  content_hash text not null,
  embedding    vector(384) not null,
  updated_at   timestamptz not null default now(),
  unique (category, slug, heading)
);
create index if not exists help_chunks_embedding_idx
  on public.help_chunks using hnsw (embedding vector_cosine_ops);
alter table public.help_chunks enable row level security;
comment on table public.help_chunks is
  'Help-center article chunks + gte-small embeddings for RAG support search. Written by the help:index pipeline (service role); read via match_help_chunks. See docs/SUPPORT-SYSTEM.md.';

-- 2. Cosine top-k match over help chunks. Security definer so anon can query
--    (help is public) without direct table access.
create or replace function public.match_help_chunks(
  query_embedding vector(384),
  match_count int default 6,
  min_similarity float default 0.0
)
returns table (category text, slug text, heading text, content text, similarity float)
language sql
stable
security definer
set search_path = public
as $$
  select c.category, c.slug, c.heading, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.help_chunks c
  where 1 - (c.embedding <=> query_embedding) >= min_similarity
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
grant execute on function public.match_help_chunks(vector, integer, double precision) to anon, authenticated;

-- 3. AI usage ledger — per-call cost attribution for caps + COGS tracking
--    (docs/AI-STRATEGY.md). Internal: RLS on, no policy => service role only.
create table if not exists public.ai_usage (
  id            uuid primary key default gen_random_uuid(),
  feature       text not null,
  model         text not null,
  input_tokens  int not null default 0,
  output_tokens int not null default 0,
  cost_usd      numeric(10,6) not null default 0,
  profile_id    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists ai_usage_feature_created_idx on public.ai_usage (feature, created_at);
alter table public.ai_usage enable row level security;
comment on table public.ai_usage is
  'AI call cost ledger (feature, model, tokens, cost). Service-role writes; powers per-feature caps + COGS. See docs/AI-STRATEGY.md.';

-- 4. Operator kill switch for AI (defaults OFF -- flip on when ready).
insert into public.platform_flags (key, value) values ('ai_enabled', false)
on conflict (key) do nothing;
