-- CRM pipeline suite (ADR-102) — a unified sales pipeline layered over the
-- existing contacts CRM. Three additive, service-role-only tables (accessed behind
-- the CRM guards, like contacts/team_members — no RLS policies). Stages are generic
-- and reorderable; a deal links to the unified contact record (contacts) and/or a
-- member (profiles), with a denormalized contact_name so a card always renders.
-- Activities cover notes/calls/emails/meetings + due-dated tasks.

create table if not exists public.crm_stages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  int  not null default 0,
  kind        text not null default 'open',  -- open | won | lost
  created_at  timestamptz not null default now()
);

create table if not exists public.crm_deals (
  id                   uuid primary key default gen_random_uuid(),
  title                text not null,
  contact_name         text,
  contact_id           uuid references public.contacts(id) on delete set null,
  profile_id           uuid references public.profiles(id) on delete set null,
  stage_id             uuid references public.crm_stages(id) on delete set null,
  value                numeric not null default 0,
  currency             text not null default 'USD',
  status               text not null default 'open',  -- open | won | lost (mirrors stage kind)
  source               text,
  expected_close_date  date,
  owner_id             uuid references public.profiles(id) on delete set null,
  created_by           uuid references public.profiles(id) on delete set null,
  sort_order           numeric not null default 0,
  closed_at            timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists crm_deals_stage_idx   on public.crm_deals (stage_id);
create index if not exists crm_deals_owner_idx    on public.crm_deals (owner_id);
create index if not exists crm_deals_status_idx   on public.crm_deals (status);
create index if not exists crm_deals_contact_idx  on public.crm_deals (contact_id);

create table if not exists public.crm_activities (
  id           uuid primary key default gen_random_uuid(),
  deal_id      uuid references public.crm_deals(id) on delete cascade,
  contact_id   uuid references public.contacts(id) on delete cascade,
  kind         text not null default 'note',  -- note | call | email | meeting | task
  body         text not null default '',
  due_at       timestamptz,                   -- set for tasks
  completed_at timestamptz,                   -- set when a task is done
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists crm_activities_deal_idx on public.crm_activities (deal_id);
create index if not exists crm_activities_open_task_idx
  on public.crm_activities (due_at) where due_at is not null and completed_at is null;

alter table public.crm_stages     enable row level security;
alter table public.crm_deals      enable row level security;
alter table public.crm_activities enable row level security;
-- No policies: all access is service-role behind the CRM guards (host+ / staff).

-- Seed a sensible default pipeline (generic opportunities), once.
insert into public.crm_stages (name, sort_order, kind)
select v.name, v.sort_order, v.kind from (values
  ('Lead', 1, 'open'),
  ('Contacted', 2, 'open'),
  ('Qualified', 3, 'open'),
  ('Proposal', 4, 'open'),
  ('Won', 5, 'won'),
  ('Lost', 6, 'lost')
) as v(name, sort_order, kind)
where not exists (select 1 from public.crm_stages);

comment on table public.crm_deals is
  'CRM pipeline opportunities (ADR-102). Generic, reorderable stages; links to the unified contact (contacts) and/or member (profiles). Service-role only.';
comment on table public.crm_activities is
  'CRM activities + tasks on a deal/contact (ADR-102): note/call/email/meeting, or a due-dated task (due_at + completed_at). Service-role only.';
