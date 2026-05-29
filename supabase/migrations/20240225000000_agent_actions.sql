-- Phase 6.6 (COMMS-CRM §4; ADR-028): the AI operator's Action Queue. The agent
-- (deterministic proposer now, Claude later) proposes actions; a human approves;
-- on approval the action runs THROUGH the spine. Copilot-first: nothing executes
-- without approval. Service-role only. Additive.

create table if not exists public.agent_actions (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,                       -- email_contact (MVP)
  payload     jsonb not null default '{}'::jsonb,
  rationale   text,
  status      text not null default 'proposed',    -- proposed | approved | executed | dismissed | failed
  created_at  timestamptz not null default now(),
  decided_by  uuid references public.profiles(id) on delete set null,
  decided_at  timestamptz
);
create index if not exists agent_actions_status_idx on public.agent_actions (status, created_at desc);

alter table public.agent_actions enable row level security;
-- No policies: Studio-only (behind requireStaff) + the server-side proposer/executor.

comment on table public.agent_actions is
  'AI operator Action Queue (copilot). Proposed actions await human approval; on approve they run through the spine. Service-role only. See docs/COMMS-CRM-ARCHITECTURE.md §4 + ADR-028.';
