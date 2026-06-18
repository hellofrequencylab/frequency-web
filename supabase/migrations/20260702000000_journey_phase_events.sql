-- ADR-307 follow-up: per-week scheduled touchpoint Events for a Journey Run.
--
-- The Master Template gives each week two standing touchpoints — a mid-week Circle Meetup and a
-- weekend Gathering. The plan-level `journey_plans.meeting` jsonb holds the STANDING descriptors
-- ("Sundays 7pm"). This table lets a Run Host put a REAL, dated Event on the calendar for a given
-- week (phase) and kind, generalizing the single `journey_runs.kickoff_event_id` link. The learner
-- player shows the dated event when one exists, else falls back to the standing descriptor.
--
-- Service-role only (RLS on, no policies) — matches journey_runs / journey_enrollments; all reads
-- and writes go through the admin client behind the Host gate in app code (run-actions.ts).

create table if not exists public.journey_phase_events (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid not null references public.journey_runs(id) on delete cascade,
  phase_id   uuid not null references public.journey_plan_items(id) on delete cascade,
  kind       text not null check (kind in ('meetup', 'gathering')),
  event_id   uuid not null references public.events(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One event per (run, phase, kind) — re-scheduling relinks the same slot.
create unique index if not exists journey_phase_events_uq
  on public.journey_phase_events (run_id, phase_id, kind);
create index if not exists journey_phase_events_run_idx
  on public.journey_phase_events (run_id);

alter table public.journey_phase_events enable row level security;
