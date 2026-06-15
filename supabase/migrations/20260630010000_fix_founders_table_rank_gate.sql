-- =============================================================================
-- Fix the Founders' Table rank gate for the completion-model rank ladder.
--
-- The 'founders-table-seat' store item was seeded (20260614200000_rewards_economy_v2)
-- gated on metadata.requires_rank = 'conduit'. That rank was dropped in the rank
-- enum 6→4 migration (20260628010000). With 'conduit' gone, the store action's
-- rank-order lookup (['ghost','initiate','adept','master']) returns index -1, so
-- the gate silently never applies and the item is purchasable by anyone — the
-- opposite of intended. Re-point it at 'adept' (the new "one below the apex"
-- position Conduit held in the old 6-rank ladder).
--
-- DO NOT APPLY MANUALLY — the orchestrator applies to prod after review.
-- =============================================================================

-- ── UP ───────────────────────────────────────────────────────────────────────
UPDATE public.store_items
SET metadata = jsonb_set(metadata, '{requires_rank}', '"adept"', true)
WHERE slug = 'founders-table-seat'
  AND metadata->>'requires_rank' = 'conduit';

-- ── DOWN ───────────────────────────────────────────────────────────────────────
-- UPDATE public.store_items
-- SET metadata = jsonb_set(metadata, '{requires_rank}', '"conduit"', true)
-- WHERE slug = 'founders-table-seat';
