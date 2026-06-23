// CONVERSION MECHANICS — the season-reset upgrade prompt + conversion nudges (ADR-370,
// REMAINING-WORK #8). The PURE timing logic (no IO): "is the season close enough to its reset that an
// earn-only member should be nudged to convert before their standing resets?" The component that
// renders the nudge (components/quest/season-reset-prompt.tsx) is GATED on the gamification_full gate,
// so it is INERT while billing is OFF (the gate grants → the member is not earn-only-gated → no nudge).
//
// THE INVARIANT (ADR-370): no conversion nudge that did not exist today appears while billing is OFF.
// The season-reset prompt only ever shows when billing is live AND the viewer is gated to earn-only,
// which never happens with billing OFF (gamificationFullAllowed returns true). No em dashes.

/** Default window (days) before a season reset within which to surface the convert-before-reset nudge. */
export const SEASON_RESET_NUDGE_DAYS = 7

/** Whole days from `now` until a season's reset (ends_at). Null when there is no end date or it is in
 *  the past. PURE — unit-testable. */
export function daysUntilSeasonReset(endsAt: string | null | undefined, now: Date = new Date()): number | null {
  if (!endsAt) return null
  const end = Date.parse(endsAt)
  if (Number.isNaN(end)) return null
  const ms = end - now.getTime()
  if (ms <= 0) return null
  return Math.ceil(ms / (24 * 60 * 60 * 1000))
}

/** Should the convert-before-reset nudge show for an earn-only viewer? TRUE only when the season is
 *  within the nudge window of its reset. PURE — the EARN-ONLY gating (which makes this inert while
 *  billing is OFF) is applied by the caller via gamificationFullAllowed. */
export function shouldNudgeBeforeReset(
  endsAt: string | null | undefined,
  opts: { windowDays?: number; now?: Date } = {},
): boolean {
  const days = daysUntilSeasonReset(endsAt, opts.now)
  if (days === null) return false
  return days <= (opts.windowDays ?? SEASON_RESET_NUDGE_DAYS)
}
