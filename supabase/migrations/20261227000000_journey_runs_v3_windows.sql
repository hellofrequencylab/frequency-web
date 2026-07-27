-- JOURNEY RUNS v3 — run-between-dates + per-run seats (ADR-838, Journeys lane J1).
--
-- The draft/edit/publish system gives a published Journey scheduled COHORT WINDOWS: a Run can
-- now carry its own window (starts/ends), its own seat count, and a 'scheduled' status for a
-- Run created ahead of its window (the lane-3 launch surface flips it active at window start).
-- Gap analysis against journeys_v2 (20260621) + lib/database.types.ts:
--   * window_starts_at / window_ends_at — NEW. journey_plans already carries plan-level window
--     dates (the overall availability window); these are the RUN's own dates, so one plan can
--     host staggered cohorts. Null = the legacy anchor model (drip from started_at, no close).
--   * drip cadence override — ALREADY EXISTS (journey_runs.drip_interval_days, journeys_v2);
--     no change here. The run value stays the per-cohort override of the plan's cadence.
--   * enroll_cap — NEW on runs. journey_plans.enroll_cap (20260630) is the plan-wide seat
--     count; the run column caps ONE cohort. Null = inherit the plan cap.
--   * status vocabulary — WIDENED: + 'scheduled' (created ahead of its window). The existing
--     'active' default and 'completed'/'cancelled' terminal states are unchanged.
--
-- APPLIED to production 2026-07-27 (owner approved). ADDITIVE + IDEMPOTENT (add column if not
-- exists / do-block + drop-loop constraints / create index if not exists), so a re-run is safe.
-- lib/database.types.ts carries the matching delta, so the new columns read through the typed
-- client.

-- ── New run-level columns ────────────────────────────────────────────────────────────────────

alter table public.journey_runs
  add column if not exists window_starts_at timestamptz,
  add column if not exists window_ends_at   timestamptz,
  add column if not exists enroll_cap       integer;

comment on column public.journey_runs.window_starts_at is
  'ADR-838 run-between-dates: when THIS cohort opens (also the drip anchor once set; falls back to started_at). Null = legacy anchor model.';
comment on column public.journey_runs.window_ends_at is
  'ADR-838 run-between-dates: when this cohort closes. Null = open-ended.';
comment on column public.journey_runs.enroll_cap is
  'ADR-838: seats in THIS cohort. Null = inherit journey_plans.enroll_cap; the plan cap remains the overall ceiling.';

-- ── Sanity checks (idempotent do-block adds, mirroring 20261226_comms_scope_spine) ──────────

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'journey_runs_window_order_check') then
    alter table public.journey_runs
      add constraint journey_runs_window_order_check
      check (window_starts_at is null or window_ends_at is null or window_ends_at > window_starts_at);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'journey_runs_enroll_cap_check') then
    alter table public.journey_runs
      add constraint journey_runs_enroll_cap_check
      check (enroll_cap is null or enroll_cap > 0);
  end if;
end $$;

-- ── Status vocabulary: + 'scheduled' ─────────────────────────────────────────────────────────
-- Rebuild whatever status CHECK exists (the journeys_v2 inline check is unnamed on some
-- baselines), then add the v3 named set. Same drop-loop pattern as journeys_v2's block_type.

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.journey_runs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.journey_runs drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.journey_runs
  add constraint journey_runs_status_check
  check (status in ('scheduled', 'active', 'completed', 'cancelled'));

comment on column public.journey_runs.status is
  'scheduled (created ahead of its window, ADR-838) -> active -> completed | cancelled.';

-- ── The launch-surface reads ─────────────────────────────────────────────────────────────────
-- "Upcoming and open cohorts for this plan": eq(plan_id) ordered by window. Partial — legacy
-- anchor-model runs (window null) cost nothing.
create index if not exists journey_runs_plan_window_idx
  on public.journey_runs (plan_id, window_starts_at)
  where window_starts_at is not null;
