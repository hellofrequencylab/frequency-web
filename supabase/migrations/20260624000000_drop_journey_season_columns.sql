-- Drop the legacy season columns from journey_plans (ADR-253, docs/JOURNEYS.md §11.1 #6).
-- The v1 season reward + progress engine is retired (v2 rewards come solely from completing
-- lessons/phases in a Run). With nothing in the app reading or writing them anymore (the grant
-- firing, the season derivation, and the editor patch-writers were removed across ADR-253
-- steps 1-3), these three columns are now dead and are dropped here.
--
-- ✅ APPLIED. Corrected 2026-09-06 (HYG-054); this header read "NOT yet applied" long after
-- the fact. The Supabase migration ledger (supabase_migrations.schema_migrations) carries
-- version 20260624000000 (drop_journey_season_columns), and the live schema has none of the
-- three columns, both re-read 2026-09-06. The ledger table stores only version + name and no
-- apply timestamp, so there is no exact apply DATE to record here; the ledger row plus the
-- schema reading is the whole of the evidence. lib/database.types.ts is regenerated and shows
-- the columns gone. Guarded with IF EXISTS, so still safe to re-run.
--
-- NOTE: journey_plan_adoptions is deliberately NOT dropped here — ADR-253 keeps it; it is still
-- referenced elsewhere (content-signals, coop-pulse, circles/admin-actions, the prompt cron,
-- the demo engine). Retiring it is a separate, later assessment.

alter table public.journey_plans
  drop column if exists season_locked,
  drop column if exists min_practices_per_day,
  drop column if exists target_weeks;
