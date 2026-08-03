// Adoption terms — the PURE core of the practice commitment model (ADR-920).
//
// A member adopts a practice FOR A TERM (2 / 4 / 8 weeks) or ONGOING. The evidence shape
// (docs/PRACTICE-LIBRARY.md §Adoption + the ADR): time-boxed commitments lower the cost of
// saying yes and outperform open-ended intentions for NEW habits; automaticity medians sit
// near 66 days (Lally 2010), so 8 weeks is the "builds it for good" recommendation while 4
// stays the default ask. A finished term is a completion moment, never a silent expiry —
// the sweep (Phase 3) celebrates it and offers the next commitment.
//
// PURE + framework-independent: no Supabase, no Next, no Date.now() — callers pass `today`
// (the member-local day, same framing as practice_logs.logged_for). Fully unit-testable.

/** One term chip on the adopt surface. `weeks: null` = ongoing (no end date). */
export interface TermPreset {
  weeks: number | null
  /** Chip label (plain voice, no em dashes). */
  label: string
  /** The one-line why, shown as the chip's tooltip/subtext. */
  hint: string
  default?: boolean
  /** The evidence-backed "builds it for good" nudge (8 weeks ≈ the 66-day automaticity median). */
  recommended?: boolean
}

/** The four presets, in display order. Four on purpose: more chips = choice overload at the
 *  exact moment we want a fast yes. */
export const TERM_PRESETS: readonly TermPreset[] = [
  { weeks: 2, label: '2 weeks', hint: 'A short trial. See if it fits.' },
  { weeks: 4, label: '4 weeks', hint: 'The standard commitment. One month, one habit.', default: true },
  { weeks: 8, label: '8 weeks', hint: 'Long enough to make it stick for good.', recommended: true },
  { weeks: null, label: 'Ongoing', hint: 'No end date. Yours until you retire it.' },
] as const

/** The default term when the member does not pick (weeks). */
export const DEFAULT_TERM_WEEKS = 4

/** Max cue length (mirrors the DB check). */
export const MAX_CUE_LEN = 140

/** Active SELF-adopted practices a member may hold at once (owner decision, 2026-08-03).
 *  Journey-sourced adoptions ride outside the cap — they are phase-scoped and expire on
 *  their own. Enforced softly in app code (a swap prompt, never a data-losing wall). */
export const ACTIVE_PRACTICE_CAP = 5

/** Narrow arbitrary input to a valid preset weeks value (or null = ongoing). Unknown values
 *  fall to the DEFAULT (4): a malformed term must never accidentally mint an ongoing row. */
export function coerceTermWeeks(raw: unknown): number | null {
  if (raw === null || raw === 'ongoing') return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (TERM_PRESETS.some((p) => p.weeks === n)) return n
  return DEFAULT_TERM_WEEKS
}

/** Clamp + trim a member cue. Empty → null. */
export function cleanCue(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim().slice(0, MAX_CUE_LEN)
  return t.length ? t : null
}

/** The term window for an adoption starting `today` (member-local YYYY-MM-DD).
 *  ends_on is INCLUSIVE: a 2-week term starting Aug 3 ends Aug 16 (14 practice days).
 *  weeks null = ongoing → endsOn null. */
export function termWindow(today: string, weeks: number | null): { startsOn: string; endsOn: string | null } {
  if (weeks == null) return { startsOn: today, endsOn: null }
  const d = parseDay(today)
  d.setUTCDate(d.getUTCDate() + weeks * 7 - 1)
  return { startsOn: today, endsOn: formatDay(d) }
}

/** Where a member stands inside a term. Day/week are 1-based and endowed: the adoption day is
 *  Day 1 immediately (a never-empty bar finishes more often, Nunes & Drèze 2006). Days past
 *  the end clamp to the total so a late read never shows "Day 30 of 28". */
export interface TermProgress {
  day: number
  totalDays: number | null
  week: number
  totalWeeks: number | null
  /** True once today is past ends_on (the sweep's trigger; ongoing terms never finish). */
  finished: boolean
}

export function termProgress(input: { startsOn: string; endsOn: string | null; today: string }): TermProgress {
  const start = parseDay(input.startsOn).getTime()
  const today = parseDay(input.today).getTime()
  const DAY = 86_400_000
  const rawDay = Math.floor((today - start) / DAY) + 1
  if (input.endsOn == null) {
    const day = Math.max(1, rawDay)
    return { day, totalDays: null, week: Math.ceil(day / 7), totalWeeks: null, finished: false }
  }
  const end = parseDay(input.endsOn).getTime()
  const totalDays = Math.round((end - start) / DAY) + 1
  const day = Math.min(Math.max(1, rawDay), totalDays)
  return {
    day,
    totalDays,
    week: Math.ceil(day / 7),
    totalWeeks: Math.ceil(totalDays / 7),
    finished: today > end,
  }
}

/** May the member self-adopt one more? `activeSelfCount` counts active source='self' rows only
 *  (journey rows are exempt). Fail-safe: a negative count reads as 0. PURE. */
export function withinActiveCap(activeSelfCount: number): boolean {
  return Math.max(0, activeSelfCount) < ACTIVE_PRACTICE_CAP
}

function parseDay(day: string): Date {
  // YYYY-MM-DD at UTC midnight; the member-day resolution happened upstream.
  return new Date(`${day}T00:00:00Z`)
}

function formatDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}
