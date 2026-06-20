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
  'journey-review': 3,    // Vera's rank quality gate on member-built Journeys (Opus; low-volume, fail-closed)
  'space-copilot': 2,     // per-Space owner profile drafting (bio/tagline/offering blurb, Haiku)
}

export function dailyCapFor(feature: string, fallbackUsd = 1): number {
  return FEATURE_DAILY_CAP_USD[feature] ?? fallbackUsd
}

// Per-Space daily spend cap (USD). A single Space can spend at most this much per day on a
// space-scoped feature, so no one Space can run up the whole feature's bill (the feature's
// global cap in FEATURE_DAILY_CAP_USD still applies on top). A small fraction of the feature
// cap keeps any one Space well under the surface ceiling; tuned conservatively until real usage
// data exists.
export const SPACE_DAILY_CAP_USD = 0.5

/** The per-Space daily cap for a feature: the smaller of a fixed per-Space ceiling and the
 *  feature's own global cap (a Space can never be allowed more than the whole feature). */
export function spaceDailyCapFor(feature: string): number {
  return Math.min(SPACE_DAILY_CAP_USD, dailyCapFor(feature))
}
