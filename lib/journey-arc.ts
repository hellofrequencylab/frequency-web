// The Arc clock (ADR-197; docs/JOURNEYS.md §3). A season is exactly 91 days = 13 × 7,
// anchored on/near the solstice. Journey COMPLETION is derived from the practice log
// against these fixed season-week buckets — there is no progress table.
//
// This is the counterpart to the rolling Rhythm clock (weeklyTargetFromCadence in
// journey-plans.ts). The two answer different questions and never fight:
//   • Rhythm clock (rolling 7 days, today-anchored) → "am I in rhythm right now?"
//   • Arc clock    (fixed 91-day season buckets)    → "how many weeks have I banked?"
// Pure + framework-independent → unit-tested in journey-arc.test.ts.

export const SEASON_DAYS = 91
export const SEASON_WEEKS = 13
/** Qualifying weeks needed to complete a Journey, of the 13 (forgiving by design). */
export const DEFAULT_TARGET_WEEKS = 8

/** Whole days between two YYYY-MM-DD dates (UTC), matching practice_logs.logged_for. */
function daysBetween(fromDate: string, toDate: string): number | null {
  const from = Date.parse(`${fromDate}T00:00:00Z`)
  const to = Date.parse(`${toDate}T00:00:00Z`)
  if (Number.isNaN(from) || Number.isNaN(to)) return null
  return Math.floor((to - from) / 86_400_000)
}

/**
 * Zero-based season-week bucket (0..12) for a log date, or null if the date falls
 * outside the season's 91-day window. bucket = floor((logged_for − start) / 7).
 */
export function seasonWeekBucket(loggedFor: string, seasonStart: string): number | null {
  const d = daysBetween(seasonStart, loggedFor)
  if (d === null || d < 0 || d >= SEASON_DAYS) return null
  return Math.floor(d / 7)
}

/** The 1-based season week (1..13) for "today" given the season start, or null if outside. */
export function currentSeasonWeek(today: string, seasonStart: string): number | null {
  const b = seasonWeekBucket(today, seasonStart)
  return b === null ? null : b + 1
}

/**
 * Count DISTINCT qualifying season-weeks from a set of qualifying day-dates. A day has
 * already passed the min-practices-per-day bar upstream; here we just bucket + dedupe.
 * Days outside the season window are ignored.
 */
export function qualifyingWeeks(qualifyingDays: Iterable<string>, seasonStart: string): number {
  const buckets = new Set<number>()
  for (const day of qualifyingDays) {
    const b = seasonWeekBucket(day, seasonStart)
    if (b !== null) buckets.add(b)
  }
  return buckets.size
}

/** A Journey is complete once enough distinct weeks qualify (default 8 of 13). */
export function isJourneyComplete(
  weeksQualified: number,
  targetWeeks: number = DEFAULT_TARGET_WEEKS,
): boolean {
  return weeksQualified >= targetWeeks
}
