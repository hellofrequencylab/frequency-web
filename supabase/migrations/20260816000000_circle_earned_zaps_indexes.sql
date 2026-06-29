-- =====================================================================
-- Indexes for the per-circle "Zaps earned here" panel (circle detail page).
-- =====================================================================
-- The circle "health" panel now sums Zaps genuinely earned THROUGH the circle
-- (lib/circles/earned.ts getCircleEarnedZaps) instead of members' personal season
-- totals. Two circle-scoped filtered reads back it:
--   • practice_logs filtered by circle_id (sum of zaps_awarded)
--   • zap_transactions filtered by the circleId stamped in metadata (Expression-at-Circle)
-- The panel is operator/Insight-gated, but these are the hot ledger tables, so neither
-- read should seq-scan. Both indexes are partial (only the circle-attributed rows) and
-- idempotent. No data change.
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_practice_logs_circle
  ON practice_logs (circle_id)
  WHERE circle_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_zap_transactions_circle
  ON zap_transactions ((metadata->>'circleId'))
  WHERE metadata->>'circleId' IS NOT NULL;
