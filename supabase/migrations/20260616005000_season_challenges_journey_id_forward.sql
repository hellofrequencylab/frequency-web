-- REPLAY FIX (forward-declare): introduce season_challenges.journey_id BEFORE its
-- first consumers on a fresh apply.
--
-- The Expression-Capstone link column season_challenges.journey_id is authored in
-- 20260628010000_quest_completion_model.sql, but several EARLIER migrations already
-- reference it:
--   * 20260616010000_one_expression_per_journey.sql  -- unique index on (season, journey_id)
--   * 20260629000100_seed_shine_season.sql           -- INSERT ... (..., journey_id)
-- On a fresh apply (db-tests) the column did not yet exist, so those failed with
-- "column journey_id does not exist" (42703).
--
-- This migration adds the SAME column definition (idempotent, nullable, identical FK)
-- so the ledger is self-consistent. ADD COLUMN IF NOT EXISTS makes it a no-op both on
-- prod (where the prod-applied 20260628010000 already created it) and when
-- 20260628010000 itself replays later in the fresh-apply ledger.
--
-- journey_plans exists since 20260605020000_journey_plans.sql, so the FK resolves here.

ALTER TABLE public.season_challenges
  ADD COLUMN IF NOT EXISTS journey_id uuid REFERENCES public.journey_plans(id) ON DELETE SET NULL;
