// PER-REQUEST RATE LIMITING FOR EVERY AI DOOR (LIVE-195).
//
// The ledger in lib/ai/usage.ts bounds SPEND PER DAY. It does not bound how fast one signed-in
// member can knock. Until this module existed, a member could drive a paid model in a tight loop
// and the only thing that stopped them was a daily cap tripping — for everybody at once. This is
// the missing per-actor throttle: a sliding window per (feature, actor), so one loop costs that
// one actor their own window and nobody else's afternoon.
//
// ONE MECHANISM, NOT A SECOND ONE. Everything here delegates to `rateLimitOk` in lib/rate-limit.ts
// (Upstash sliding window), the same limiter every abuse-prone public endpoint already uses. This
// module only decides two things a generic limiter cannot: what a sensible window is per AI
// surface, and what an unconfigured limiter should answer.
//
// WHAT AN UNCONFIGURED LIMITER ANSWERS: `allow`. lib/rate-limit's default is `deny` in production,
// which is right for a public write — an absent Upstash integration must not silently unthrottle
// one. An AI door is the other case named in `UnconfiguredPolicy`: denying here would switch OFF
// every AI surface in the product at once, silently, with each door degrading to its deterministic
// fallback and no error anywhere for an operator to notice. Allowing leaves an unconfigured deploy
// exactly where it stood before this module existed, and spend there is still bounded by the
// per-feature daily caps and the global daily ceiling (lib/ai/budget.ts). Failure mode is lockout,
// not abuse, so the policy is `allow` — stated once, here, rather than at thirty call sites.
//
// HOW A DOOR USES IT: beside the budget gate, refusing exactly the way that door already refuses
// when it is over budget.
//
//   if (await featureOverBudget(FEATURE)) return null
//   if (await aiRateLimited(FEATURE, input.profileId)) return null
//
// The refusal is deliberately NOT a new message. Every door already has a member-voice answer for
// "the model is not available to you right now" (a deterministic fallback, an `ai_unavailable`
// reason, a deflected help answer, "Vera is resting right now. Try again in a bit."), and a
// throttled member gets that same one. A second vocabulary for the same event would be a second
// thing to keep on-voice.

import { rateLimitOk } from '@/lib/rate-limit'

/** The sliding-window spec `rateLimitOk` accepts (e.g. '1 m', '10 s'). */
type Window = Parameters<typeof rateLimitOk>[3]

export interface AiRateLimit {
  /** Calls allowed per actor per window. */
  limit: number
  /** The sliding window. */
  window: Window
}

/**
 * The default for any AI feature that does not declare its own: ten calls a minute per actor.
 * Well above what a person clicking a button can produce, well below what a loop can.
 */
export const DEFAULT_AI_RATE_LIMIT: AiRateLimit = { limit: 10, window: '1 m' }

/**
 * Per-feature windows, by the SHAPE of the surface rather than by its price:
 *
 *   • CONVERSATIONAL — one turn per member thought. Generous; a chat that throttles a fast typist
 *     is broken.
 *   • FANNED-OUT — one page render asks for several at once (the "For you" lane draws four blurbs
 *     in parallel), so the window has to clear a burst plus a couple of reloads.
 *   • HEAVY — Opus reasoning or a vision read. A person triggers one, reads the result, and
 *     triggers another; anything faster is a loop.
 *
 * Every key here must be a real budget key (lib/ai/budget.ts) — rate-limit.test.ts enforces that,
 * so a typo throttles nothing rather than silently inventing a surface. A feature with no row
 * takes DEFAULT_AI_RATE_LIMIT.
 */
export const AI_RATE_LIMITS: Record<string, AiRateLimit> = {
  // ── Conversational ────────────────────────────────────────────────────────────────────────
  'vera-chat': { limit: 20, window: '1 m' },

  // ── Fanned-out reads (several per page render) ────────────────────────────────────────────
  'event-blurb': { limit: 40, window: '1 m' },   // four per "For you" render, cached per day after
  'help-search': { limit: 10, window: '1 m' },
  'room-search': { limit: 20, window: '1 m' },

  // ── Heavy: Opus reasoning, or a vision read of an uploaded image ──────────────────────────
  'journey-composition': { limit: 5, window: '1 m' },
  'journey-edit': { limit: 5, window: '1 m' },
  'journey-review': { limit: 5, window: '1 m' },
  'practice-edit': { limit: 5, window: '1 m' },
  'entity-review': { limit: 5, window: '1 m' },
  'event-poster-scan': { limit: 5, window: '1 m' },
  'connection-scan': { limit: 5, window: '1 m' },
}

/** The window this feature runs on. */
export function aiRateLimitFor(feature: string): AiRateLimit {
  return AI_RATE_LIMITS[feature] ?? DEFAULT_AI_RATE_LIMIT
}

/**
 * Has this actor knocked on this AI door too fast? `true` ⇒ refuse, the same shape as
 * `featureOverBudget`, so a door reads the two gates the same way.
 *
 * `actorId` is normally the caller's profile id. An anonymous door passes the caller's IP
 * instead (that is what the deleted /help/ask handler limited on). NO ACTOR ⇒ NOT LIMITED:
 * a null id means nobody is knocking — a cron sweep or a queue worker running the same feature
 * across many members — and per-actor throttling is not the tool for that. Those paths are
 * bounded by their own batch sizes and by the daily caps.
 *
 * FAIL-SAFE: `rateLimitOk` swallows a Redis hiccup and allows, and an unconfigured limiter
 * allows here (see the header). This function never throws.
 */
export async function aiRateLimited(
  feature: string,
  actorId: string | null | undefined,
): Promise<boolean> {
  if (!actorId) return false
  const { limit, window } = aiRateLimitFor(feature)
  const ok = await rateLimitOk(`ai:${feature}`, actorId, limit, window, { whenUnconfigured: 'allow' })
  return !ok
}
