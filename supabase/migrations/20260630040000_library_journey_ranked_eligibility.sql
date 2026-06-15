-- =============================================================================
-- Member-built (library) Journeys count toward season rank — once Vera approves.
-- (ADR-quest member-built; decision 2026-06-15: practice-days bar + Vera gate.)
--
-- A library Journey finishes toward rank when the member logs its Practices on
-- ~14 distinct days inside a MEMBER-ANCHORED ~4-week window (journey_enrollments
-- .started_at + 28 days) — no Expression Challenge required (that stays the
-- official-Journey ceremony). BUT only Journeys Vera has reviewed into the ranked
-- library count: the completion engine reads `ranked_eligible`.
--
-- DO NOT APPLY MANUALLY — the orchestrator applies to prod after review.
-- =============================================================================

-- ── UP ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.journey_plans
  ADD COLUMN IF NOT EXISTS ranked_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vera_review     jsonb;

-- The official season Journeys are ranked by definition.
UPDATE public.journey_plans SET ranked_eligible = true WHERE official = true;

COMMENT ON COLUMN public.journey_plans.ranked_eligible IS
  'Whether finishing this Journey counts toward season rank. Official season Journeys: true. Member-built library Journeys: false until Vera reviews them into the ranked library. The completion engine only mints a rank-bearing journey_completions row for ranked_eligible Journeys.';

COMMENT ON COLUMN public.journey_plans.vera_review IS
  'Vera quality-gate outcome for a member-built Journey: { status: approved|rejected|pending, score, feedback, reviewed_at }. Coaching feedback for the author; status drives ranked_eligible.';

-- ── DOWN ───────────────────────────────────────────────────────────────────────
-- ALTER TABLE public.journey_plans DROP COLUMN IF EXISTS ranked_eligible, DROP COLUMN IF EXISTS vera_review;
