-- Demand-side query log for the living-docs loop (docs/SUPPORT-SYSTEM.md §6,
-- ADR-067). Every Ask Vera query is recorded with its outcome so recurring
-- low-confidence / deflected questions become the "to-write" list. Internal:
-- RLS on, no policy => service-role only. Applied live via MCP; mirrored here.
create table if not exists public.ai_help_queries (
  id           uuid primary key default gen_random_uuid(),
  question     text not null,
  confidence   real not null default 0,
  answered     boolean not null default false,
  deflected    boolean not null default false,
  top_category text,
  top_slug     text,
  profile_id   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists ai_help_queries_created_idx on public.ai_help_queries (created_at);
create index if not exists ai_help_queries_deflected_idx on public.ai_help_queries (deflected, created_at);
alter table public.ai_help_queries enable row level security;
comment on table public.ai_help_queries is
  'Ask Vera query log (question, confidence, outcome). Service-role only; powers the unanswered-questions to-write list. See docs/SUPPORT-SYSTEM.md.';
