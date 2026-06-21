-- =============================================================================
-- Practice-timer redesign, schema 2/3: completion economy on practice_logs (the
-- partial-vs-full timed log; WEBSITE-CHANGES-PLAN practice-timer redesign).
--
-- WHY: a timed practice can now be logged at less than full length. A member who sits
-- at least half the target (>= 50%) clears the day and earns exactly 1 Zap, with the
-- row marked NOT complete; finishing later tops the row up to complete and pays the
-- rest of the reward. A one-tap log and a full timed log are complete and pay the full
-- reward, exactly as today. These three additive columns carry that state on the log row:
--   - completed       : true for a one-tap / full log; false for a partial timed log.
--   - seconds_done     : the elapsed seconds the member actually sat (nullable; null on a
--                        one-tap / pre-feature log that has no timer behind it).
--   - seconds_target   : the length the timed log was measured against (nullable; null on
--                        a one-tap log, where there is no target).
--
-- The `completed default true` keeps every existing row + the one-tap path complete with
-- no backfill. lib/practices.logPractice writes these going forward; the partial / finish
-- branches read them. seconds_done / seconds_target stay null on the unchanged one-tap path.
--
-- NOTE: regenerate lib/database.types.ts after apply (the integrator's step). Until then
-- lib/practices.ts reaches these columns through its untyped admin handle (ADR-246).
-- =============================================================================

alter table public.practice_logs
  add column if not exists completed boolean not null default true;

alter table public.practice_logs
  add column if not exists seconds_done integer;

alter table public.practice_logs
  add column if not exists seconds_target integer;

comment on column public.practice_logs.completed is
  'true = a one-tap log OR a full timed log (full reward, streak tick); false = a PARTIAL timed log (>= 50% of target: clears the day + exactly 1 Zap). The finish top-up flips a partial row to true and pays the rest of the reward. Defaults true so every existing + one-tap log is complete with no backfill.';
comment on column public.practice_logs.seconds_done is
  'Elapsed seconds the member actually sat for a timed log (the max across a partial + its finish). NULL on a one-tap / pre-feature log with no timer behind it.';
comment on column public.practice_logs.seconds_target is
  'The target length (seconds) a timed log was measured against — duration_min*60, or the claimed open-sit minutes*60. NULL on a one-tap log (no target). Drives the partial / full ratio in lib/practices.logPractice.';
