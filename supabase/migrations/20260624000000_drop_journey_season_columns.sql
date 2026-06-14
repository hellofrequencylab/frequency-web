-- Drop the legacy season columns from journey_plans (ADR-253, docs/JOURNEYS.md §11.1 #6).
-- The v1 season reward + progress engine is retired (v2 rewards come solely from completing
-- lessons/phases in a Run). With nothing in the app reading or writing them anymore (the grant
-- firing, the season derivation, and the editor patch-writers were removed across ADR-253
-- steps 1-3), these three columns are now dead and are dropped here.
--
-- ⚠️ NOT yet applied. Apply via the Supabase SQL Editor (db push isn't safe against this
-- project's migration-history baseline — see docs/WORKFLOW.md), then regenerate
-- lib/database.types.ts. Guarded with IF EXISTS, so safe to re-run.
--
-- NOTE: journey_plan_adoptions is deliberately NOT dropped here — ADR-253 keeps it; it is still
-- referenced elsewhere (content-signals, coop-pulse, circles/admin-actions, the prompt cron,
-- the demo engine). Retiring it is a separate, later assessment.

alter table public.journey_plans
  drop column if exists season_locked,
  drop column if exists min_practices_per_day,
  drop column if exists target_weeks;
