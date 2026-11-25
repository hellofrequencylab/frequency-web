-- HYG-251 (project and messaging hub, 2026-11-24): a Space CRM task lives in crm_tasks, the one task
-- table that already holds Plan to-dos and the operator follow-up queue. Until now a Space CRM task was
-- a crm_activities row with kind='task', so a person's work sat in two tables and no list showed both.
-- crew_tasks stays separate on purpose (the member volunteer economy).
--
-- 1. crm_tasks gains deal_id (a CRM task can hang off a deal, as the activity rows could) and
--    completed_at (the board sorts done tasks by when they were finished; status says only whether).
-- 2. Every crm_activities task row moves across with its id, so a link to it keeps working, and the
--    moved rows leave crm_activities. Prod held 0 such rows on 2026-11-24; the move is for any
--    environment that has some. Insert first, then delete only what landed (on conflict do nothing
--    keeps a re-run harmless).
--
-- RLS: unchanged. crm_tasks is service-role only (no client policy); every write is gated in
-- lib/crm/space-tasks.ts (Space editor) and scoped by space_id.
--
-- ROLLBACK (no code after this release reads tasks from crm_activities):
--   insert into public.crm_activities (id, space_id, deal_id, contact_id, kind, body, due_at, completed_at, created_by, created_at)
--     select id, space_id, deal_id, contact_id, 'task', title, due_at, completed_at, created_by, created_at
--     from public.crm_tasks where plan_id is null and deal_id is not null on conflict (id) do nothing;
--   drop index if exists public.crm_tasks_deal_idx;
--   alter table public.crm_tasks drop column if exists completed_at, drop column if exists deal_id;

begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

alter table public.crm_tasks
  add column if not exists deal_id uuid references public.crm_deals(id) on delete set null;
alter table public.crm_tasks
  add column if not exists completed_at timestamptz;

comment on column public.crm_tasks.deal_id is
  'The CRM deal this task is about (HYG-251). Null when it is not about a deal.';
comment on column public.crm_tasks.completed_at is
  'When the task was marked done (HYG-251). Null while open. status stays the source of whether.';

create index if not exists crm_tasks_deal_idx
  on public.crm_tasks (deal_id) where deal_id is not null;

insert into public.crm_tasks
  (id, space_id, contact_id, deal_id, title, due_at, status, completed_at, created_by, created_at, updated_at)
select
  a.id,
  a.space_id,
  a.contact_id,
  a.deal_id,
  coalesce(nullif(btrim(a.body), ''), 'Task'),
  a.due_at,
  case when a.completed_at is not null then 'done' else 'open' end,
  a.completed_at,
  a.created_by,
  a.created_at,
  coalesce(a.completed_at, a.created_at)
from public.crm_activities a
where a.kind = 'task'
on conflict (id) do nothing;

delete from public.crm_activities a
where a.kind = 'task'
  and exists (select 1 from public.crm_tasks t where t.id = a.id);

commit;
