-- =============================================================================
-- Finish the legacy quest-chain engine retirement (ADR-152 Phase B3 ·
-- THE-QUEST.md "Legacy engine retirement" · JOURNEYS.md §2 + §13 item 8)
--
-- The old action-chain engine (`quest_chains` / `quest_steps` / `quest_progress` —
-- steps like "attend an event / make a post / refer someone", advanced by the
-- removed `advanceQuests`) was retired IN CODE long ago: the rules engine, the
-- /crew/quests action-chain reads, and `startQuest` are gone. `journey_plans` is
-- the single Journey spine (this migration's sibling seeds the 4 official seasonal
-- Journeys there). The mechanic those chains expressed now lives in
-- `season_challenges` + `achievements`.
--
-- This migration physically drops the dormant engine:
--   • the `quest_outcomes()` analytics RPC (no longer read — lib/analytics/
--     outcomes.ts now returns an empty Journeys section),
--   • the `quest_chains` / `quest_steps` / `quest_progress` tables (and, by
--     CASCADE, their FKs, indexes, RLS policies, and all seed remnants —
--     including the `seasonal_pillar_journeys` chains seeded in
--     20260607050000 + 20260607070000 + 20240119000000).
--
-- KEPT for historical continuity (per THE-QUEST.md): the `quest_complete`
-- engagement-source key on `engagement_events` is NOT touched — past events stay
-- valid and queryable.
--
-- ⚠️ APPLY-ORDER BLOCKER (not applied here — SQL only): `app/(main)/admin/quests/
-- page.tsx` + `app/(main)/admin/quests/actions.ts` (outside this agent's
-- ownership) still READ/WRITE quest_chains + quest_progress, both at runtime and
-- via the generated `Database` types. Those reads must be removed (and
-- database.types.ts regenerated) by their owner BEFORE this migration is applied,
-- or that admin surface will break. Idempotent (IF EXISTS) so it can be applied
-- safely once that coordination lands.
-- =============================================================================

BEGIN;

-- 1. Drop the analytics RPC first (it depends on the engine tables). ----------
DROP FUNCTION IF EXISTS public.quest_outcomes();

-- 2. Drop the engine. CASCADE clears the child→parent FKs (quest_steps.chain_id,
--    quest_progress.chain_id → quest_chains) plus indexes + RLS policies + the
--    compatibility-view lineage, and removes every seeded chain/step/progress row.
DROP TABLE IF EXISTS public.quest_progress CASCADE;
DROP TABLE IF EXISTS public.quest_steps    CASCADE;
DROP TABLE IF EXISTS public.quest_chains   CASCADE;

COMMIT;
