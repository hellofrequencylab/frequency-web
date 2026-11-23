// Model registry + tiering for the AI core (docs/AI-STRATEGY.md, ADR-041).
// Haiku is the default; escalate to Sonnet/Opus only deliberately — model tiering
// is the single biggest cost lever.

export type ModelTier = 'haiku' | 'sonnet' | 'opus'

export const MODELS: Record<ModelTier, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-8',
}

/** The shortest prefix the provider will write to its prompt cache, in tokens, per tier. A marked
 *  prefix under this is sent and billed in full every time, with no error. Read from the provider's
 *  prompt caching page on 2026-11-23; like MODEL_PRICES, it moves whenever a tier is re-pointed. */
export const CACHE_MIN_TOKENS: Record<ModelTier, number> = {
  haiku: 4096,
  sonnet: 1024,
  opus: 1024,
}

/** Default tier for new surfaces — cheapest first (support search runs here). */
export const DEFAULT_TIER: ModelTier = 'haiku'

// Approximate list price in USD per million tokens (input, output). Used only by
// the usage ledger / budget math for relative cost tracking + caps — not billing.
// Update here if pricing changes; every caller picks it up.
export interface ModelPrice {
  inPerM: number
  outPerM: number
}

// Prices below are the published Anthropic list rates for the exact models in
// MODELS above, read from Anthropic's pricing page on 2026-09-06. Re-read them
// whenever a tier is re-pointed at a different model: the tier and its price
// must move together (LIVE-194 — opus sat at the pre-4.6 $15/$75 rate while the
// tier already pointed at claude-opus-4-8 at $5/$25, so every Opus call was
// ledgered at 3x and every Opus cap tripped at a third of its intended spend).
export const MODEL_PRICES: Record<ModelTier, ModelPrice> = {
  haiku: { inPerM: 1, outPerM: 5 },
  sonnet: { inPerM: 3, outPerM: 15 },
  opus: { inPerM: 5, outPerM: 25 },
}
