-- Phase C (ADR-088 §6): lean Room AI — semantic search over room message history.
-- Reuses the gte-small `embed` edge function + the match_help_chunks pattern.
-- Applied to prod via MCP; committed for repo/prod parity.
create extension if not exists vector;

alter table public.room_messages add column if not exists embedding vector(384);

create index if not exists room_messages_embedding_idx
  on public.room_messages using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

-- Similarity search within ONE room the caller can see (members, or any channel
-- room — mirrors the room_messages_read RLS). SECURITY DEFINER + caller gate.
create or replace function public.match_room_messages(
  _room_id uuid,
  query_embedding vector(384),
  match_count int default 12
)
returns table (id uuid, author_id uuid, body text, created_at timestamptz, similarity float)
language sql stable security definer set search_path = public as $$
  select m.id, m.author_id, m.body, m.created_at,
         1 - (m.embedding <=> query_embedding) as similarity
  from public.room_messages m
  where m.room_id = _room_id
    and m.embedding is not null
    and (
      public.am_room_member(m.room_id)
      or exists (select 1 from public.rooms r where r.id = m.room_id and r.visibility = 'channel')
    )
  order by m.embedding <=> query_embedding
  limit greatest(1, least(match_count, 30));
$$;

revoke all on function public.match_room_messages(uuid, vector, int) from public, anon;
grant execute on function public.match_room_messages(uuid, vector, int) to authenticated, service_role;
