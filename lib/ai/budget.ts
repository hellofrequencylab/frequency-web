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
// loop halts itself; tuned conservatively until real usage data exists. EVERY
// feature key that calls recordAiUsage MUST appear here — an unregistered key
// silently inherits the $1 dailyCapFor fallback, which is too loose for an Opus
// path and too tight for a high-volume one. Caps scale with the surface's tier
// (Haiku cheapest, Sonnet mid, Opus priciest) and its expected volume.
export const FEATURE_DAILY_CAP_USD: Record<string, number> = {
  'help-search': 5,
  'feature-posts': 2,
  'connection-scan': 3,        // vision OCR of cards/posters (Sonnet) — the costlier surface
  'connection-assist': 1,      // text-only Vera assist on manual entry (Haiku)
  'room-search': 1,            // semantic search over room history (free embeddings; cap is a safety net)
  'vera-chat': 5,              // Vera's live companion loop (Haiku, high-volume member-facing)
  'journey-review': 3,         // Vera's rank quality gate on member-built Journeys (Opus; low-volume, fail-closed)
  'space-copilot': 2,          // per-Space owner profile drafting (bio/tagline/offering blurb, Haiku)
  // ── Journey builder (member-facing, low-volume authoring) ─────────────────────────────────────
  'journey-spark': 3,          // draft a Journey's identity + weekly arc (Sonnet; structured, on-demand)
  'journey-composition': 4,    // compose a balanced four-Pillar week (Opus; richer reasoning, low-volume)
  'journey-edit': 4,           // apply plain-language edits to a built Journey (Opus; low-volume, fail-safe)
  'journey-slot-coaching': 1,  // one short coaching line per practice slot (Haiku; tiny, on-demand)
  // ── Circle / practice wizards (member-facing, one-shot drafts) ────────────────────────────────
  'circle-create': 1,          // suggest a circle name + about blurb (Haiku; one short draft per start)
  'practice-claim': 1,         // personalize a claimed practice template (Haiku; one short draft)
  // ── Practice builder (member-facing, low-volume authoring; mirrors the Journey builder) ───────
  'practice-spark': 2,         // draft a whole Practice from a few answers (Sonnet; structured, on-demand)
  'practice-edit': 4,          // apply plain-language edits to a built Practice (Opus; low-volume, fail-safe)
  'practice-publish-screen': 1, // advisory pre-publish quality read on one practice (Haiku; operator-triggered, one-shot)
  // ── Events (poster scan is Sonnet vision — the costliest of this group) ───────────────────────
  'event-poster-scan': 4,      // vision OCR of an event poster, plus the text assist (Sonnet vision)
  'event-spark': 3,            // draft an event from a few wizard answers or a pasted flyer (Sonnet; structured, on-demand)
  'event-blurb': 2,            // one "why you'd vibe" line per browse (Haiku; cached per day per pairing)
  'whatsapp-import': 5,        // admin dry-run: classify + extract events/housing from a chat export (Sonnet; batched, on-demand)
  // ── Operator / admin + cron surfaces (Haiku, internal) ────────────────────────────────────────
  'poster-observer': 2,        // admin moderation read on flagged poster events (Haiku; low-volume)
  'creator-tips': 2,           // admin creator-coaching analysis (Haiku; low-volume)
  'vera-memory': 3,            // cron memory compression across many members (Haiku; batched volume)
  'vera-dispatch': 2,          // Journey/prompt dispatch copy (Haiku; per-send, budget-gated)
  'studio': 2,                 // Studio recommendation drafting (Haiku; operator-facing)
  'studio-winback': 1,         // lapsed-member win-back draft (Haiku; low-volume, human-approved)
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

// GLOBAL daily spend ceiling (USD) across EVERY AI feature combined. A single hard safety net so a
// traffic spike or a runaway loop can never run up more than this much Anthropic spend in one UTC day,
// regardless of the per-feature caps above. Enforced in featureOverBudget (lib/ai/usage.ts), so every
// AI surface is bounded by it. Tuned for a small / solo launch; raise as real usage and revenue grow.
export const GLOBAL_DAILY_CAP_USD = 25
