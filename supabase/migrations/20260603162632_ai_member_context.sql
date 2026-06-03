-- Vera's per-member memory (AI-VERA.md §5, ADR-066). Rolling summary + extracted
-- facts + derived milestones — NOT raw transcripts. Member-viewable + erasable
-- (privacy is non-negotiable): RLS lets a member read + delete ONLY their own row;
-- the AI core writes via the service role (bypasses RLS). Applied live via MCP.
create table if not exists public.ai_member_context (
  profile_id         uuid primary key references public.profiles(id) on delete cascade,
  summary            text,
  facts              jsonb not null default '{}'::jsonb,
  milestones         jsonb not null default '{}'::jsonb,
  interaction_count  int not null default 0,
  last_summarized_at timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.ai_member_context enable row level security;

drop policy if exists ai_member_context_select_own on public.ai_member_context;
create policy ai_member_context_select_own on public.ai_member_context
  for select using (
    profile_id in (select id from public.profiles where auth_user_id = auth.uid())
  );
drop policy if exists ai_member_context_delete_own on public.ai_member_context;
create policy ai_member_context_delete_own on public.ai_member_context
  for delete using (
    profile_id in (select id from public.profiles where auth_user_id = auth.uid())
  );

comment on table public.ai_member_context is
  'Vera per-member memory: rolling summary + extracted facts + derived milestones (not transcripts). Member read/erase own (RLS); AI core writes via service role. See AI-VERA.md §5, ADR-066.';
