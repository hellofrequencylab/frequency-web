-- CRM TASKS — the operator follow-up list behind the Resonance CRM Tasks module (ADR-628,
-- docs/DECISIONS.md). One row per operator to-do: an assignable follow-up, optionally tied to a
-- contact, with a due date and an open/done/snoozed status. This is the OPERATOR's work queue
-- (a staff member's "call this person back Thursday"), NOT the member-facing crew_tasks volunteer
-- assignment (docs/NAMING.md "Task"): those are two different things and this table never touches
-- the crew economy.
--
-- TENANCY / SECURITY POSTURE: mirrors the ORIGINAL public.contacts posture (20240221000000_studio_
-- crm.sql) and the sibling contact_relationships table (20261167000000) — RLS ENABLED with NO client
-- policy, so the table is SERVICE-ROLE ONLY. Every read/write goes through the service-role admin
-- client behind a staff gate (lib/crm/tasks.ts); no anon/authenticated client can reach a row.
-- `space_id` is a nullable tenancy tag (null = platform / root scope) a future per-Space policy can
-- gate on without a schema change.
--
-- House style: additive + idempotent (SAFE to re-run), applied to production via the Supabase SQL
-- Editor; this file is the canonical record. Reached UNTYPED until lib/database.types.ts regenerates
-- (ADR-246); the reader casts. No em or en dashes.

-- ── The table ────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.crm_tasks (
  id                   uuid primary key default gen_random_uuid(),
  space_id             uuid references public.spaces(id),
  -- The contact this follow-up is about (nullable: a standalone operator to-do has no contact).
  contact_id           uuid references public.contacts(id) on delete cascade,
  -- The staff member who owns the task (who should do it). Profile id, service-role stamped.
  assignee_profile_id  uuid references public.profiles(id),
  title                text not null,
  notes                text,
  due_at               timestamptz,
  -- Free text, validated in code against TASK_STATUSES (lib/crm/tasks.ts). open | done | snoozed.
  status               text not null default 'open',
  -- The staff member who created the task (audit; who filed the follow-up).
  created_by           uuid references public.profiles(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- "My open queue, soonest due first" (the mine / overdue filters).
create index if not exists crm_tasks_assignee_status_due_idx
  on public.crm_tasks (assignee_profile_id, status, due_at);
-- "Every task for this contact" (the per-contact follow-up thread + the "follow up" affordance).
create index if not exists crm_tasks_contact_idx
  on public.crm_tasks (contact_id);
-- "This Space's board" (the segmentation / roster filter path).
create index if not exists crm_tasks_space_status_idx
  on public.crm_tasks (space_id, status);

-- ── RLS: service-role only, NO client policy (mirror the contacts posture) ────────────────────────
alter table public.crm_tasks enable row level security;
-- No policies: reads/writes are service-role behind a staff gate (lib/crm/tasks.ts), exactly like
-- public.contacts / public.contact_relationships in 20240221000000 / 20261167000000.

comment on table public.crm_tasks is
  'Operator follow-up tasks for the Resonance CRM (open/done/snoozed), one row per staff to-do, optionally tied to a contact. Distinct from member-facing crew_tasks (the volunteer-assignment economy). `status` is free text validated in code (lib/crm/tasks.ts). Service-role only (RLS enabled, no client policy) like public.contacts. space_id is a nullable tenancy tag (null = root/platform). ADR-628.';
