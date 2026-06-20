-- Journeys v2 (ADR-252, docs/JOURNEYS.md): clean-slate rebuild as Circle group-coaching
-- programs. Generalizes the existing block tree (adds phase/module containers) and adds the
-- cohort layer (runs + enrollments). The season-coupled fields are left in place but
-- DEPRECATED (dropped in J5 cleanup), so this migration stays additive + idempotent.
--
-- ✅ Applied (live; the v2 objects exist in the schema). Was applied via the Supabase SQL
-- Editor (db push isn't safe against this project's migration-history baseline, see
-- docs/WORKFLOW.md), then lib/database.types.ts regenerated. Additive + idempotent, so safe to re-run.

-- ── 1. Plan: drip + certificate (season fields left deprecated, not dropped here) ──────
alter table public.journey_plans
  add column if not exists drip_interval_days   int     not null default 7,
  add column if not exists certificate_enabled  boolean not null default false;
comment on column public.journey_plans.drip_interval_days is
  'Days between phase unlocks in a Run (default weekly). ADR-252.';

-- ── 2. Block tree: add phase + module container types ─────────────────────────────────
-- Generalize block_type to support the Program → Phase → Module → Lesson tree (parent_id
-- already exists). Drop whatever block_type check exists, then add the v2 set.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.journey_plan_items'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%block_type%'
  loop
    execute format('alter table public.journey_plan_items drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.journey_plan_items
  add constraint journey_plan_items_block_type_check
  check (block_type in (
    'phase', 'module',                                  -- containers (v2)
    'lesson', 'video', 'reading', 'exercise', 'reflection', 'check', 'resource', 'practice',  -- leaves
    'section'                                           -- legacy alias, kept for back-compat
  ));

-- ── 3. Runs — a Circle going through a Journey together (the cohort) ───────────────────
create table if not exists public.journey_runs (
  id                 uuid primary key default gen_random_uuid(),
  plan_id            uuid not null references public.journey_plans(id) on delete cascade,
  circle_id          uuid not null references public.circles(id) on delete cascade,
  host_id            uuid references public.profiles(id) on delete set null,
  started_at         timestamptz not null default now(),
  drip_interval_days int not null default 7,
  kickoff_event_id   uuid references public.events(id) on delete set null,
  status             text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.journey_runs is
  'A Circle running a Journey as a cohort: weekly phase drip from started_at, shared progress, group trophies. ADR-252.';
create index if not exists journey_runs_circle_idx on public.journey_runs (circle_id);
create index if not exists journey_runs_plan_idx   on public.journey_runs (plan_id);

-- ── 4. Enrollments — one row per person per take (cohort or solo) ──────────────────────
-- Replaces journey_plan_adoptions. run_id null = solo (library). The drip anchor is the
-- run's started_at (cohort) or this row's started_at (solo).
create table if not exists public.journey_enrollments (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  plan_id      uuid not null references public.journey_plans(id) on delete cascade,
  run_id       uuid references public.journey_runs(id) on delete set null,
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);
comment on table public.journey_enrollments is
  'A member taking a Journey — in a Circle Run (run_id set) or solo (run_id null). Replaces journey_plan_adoptions. ADR-252.';
create index if not exists journey_enrollments_profile_idx on public.journey_enrollments (profile_id);
create index if not exists journey_enrollments_run_idx     on public.journey_enrollments (run_id);
-- One solo enrollment per (member, plan); one enrollment per (member, run).
create unique index if not exists journey_enrollments_solo_uq on public.journey_enrollments (profile_id, plan_id) where run_id is null;
create unique index if not exists journey_enrollments_run_uq  on public.journey_enrollments (profile_id, run_id)  where run_id is not null;

-- Backfill: existing active adoptions become solo enrollments (idempotent).
do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='journey_plan_adoptions') then
    insert into public.journey_enrollments (profile_id, plan_id, started_at)
    select a.profile_id, a.plan_id, coalesce(a.adopted_at, now())
    from public.journey_plan_adoptions a
    where a.active = true
    on conflict do nothing;
  end if;
end $$;

-- ── 5. RLS — service-role only (the journey system reads via the admin client behind
-- app-code authz, ADR-042; member-facing reads go through guarded server reads). ────────
alter table public.journey_runs        enable row level security;
alter table public.journey_enrollments enable row level security;

-- ── Follow-ups (J1-J5, not in this migration) ─────────────────────────────────────────
-- * Per-phase check-in event links (a run_phase_events map) for weekly meetups.
-- * Drop the deprecated season fields (season_locked, min_practices_per_day, target_weeks)
--   + retire journey_plan_adoptions once the v2 lib/player/editor land.
