-- =============================================================================
-- Enforce one Expression Challenge per (season, journey_id) at the DB level.
--
-- Expression-Challenge authoring (ADR-288) used an application-level read-then-write
-- uniqueness guard, which can race on a simultaneous double-submit and let two
-- Expression Challenges link the same Journey in a season. The member-side lookup
-- (lib/quest/completion.ts expressionRequirement) uses .maybeSingle() on
-- (journey_id, season), so a duplicate would break it. A partial unique index makes
-- the guard durable. Verified: zero existing duplicates.
--
-- DO NOT APPLY MANUALLY — the orchestrator applies to prod after review.
-- =============================================================================

-- ── UP ───────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS season_challenges_one_expression_per_journey
  ON public.season_challenges (season, journey_id)
  WHERE journey_id IS NOT NULL;

-- ── DOWN ───────────────────────────────────────────────────────────────────────
-- DROP INDEX IF EXISTS season_challenges_one_expression_per_journey;
