// Pure cost + budget math for the usage ledger (docs/AI-STRATEGY.md cost levers,
// ADR-041). No I/O — unit-tested. The DB-backed ledger + per-feature caps that
// persist `spentUsd` land with the usage-ledger migration; these are the rules
// it applies.

import { MODEL_PRICES, type ModelTier } from './models'

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
}

/** USD cost of a call, from its token usage at the tier's price. */
export function estimateCostUsd(tier: ModelTier, usage: TokenUsage): number {
  const p = MODEL_PRICES[tier]
  return (usage.inputTokens * p.inPerM + usage.outputTokens * p.outPerM) / 1_000_000
}

/** Would this call keep a feature at/under its budget cap? Spend is inclusive. */
export function withinBudget(spentUsd: number, projectedUsd: number, capUsd: number): boolean {
  return spentUsd + projectedUsd <= capUsd
}

// Per-feature daily spend caps (USD). A hard ceiling per surface so a runaway
// loop halts itself; tuned conservatively until real usage data exists.
export const FEATURE_DAILY_CAP_USD: Record<string, number> = {
  'help-search': 5,
  'feature-posts': 2,
  'connection-scan': 3,   // vision OCR of cards/posters (Sonnet) — the costlier surface
  'connection-assist': 1, // text-only Vera assist on manual entry (Haiku)
  'room-search': 1,       // semantic search over room history (free embeddings; cap is a safety net)
  'vera-chat': 5,         // Vera's live companion loop (Haiku, high-volume member-facing)
}

export function dailyCapFor(feature: string, fallbackUsd = 1): number {
  return FEATURE_DAILY_CAP_USD[feature] ?? fallbackUsd
}
