// Journeys v2 — the phase DRIP schedule (ADR-252, docs/JOURNEYS.md §3). Pure + deterministic
// so it's unit-tested and shared by the Run view, the solo view, and notifications. Phase 0
// (the first phase) unlocks at the start; each later phase unlocks one drip interval after the
// previous. The anchor is the Run's `started_at` (cohort) or the enrollment's `started_at`
// (solo) — the caller passes whichever applies. Once unlocked a phase stays open (catch-up).

const DAY_MS = 86_400_000

/** The cadence value that means "one phase each calendar month" (owner, 2026-10-07). updatePlan
 *  already clamps drip_interval_days to 1..30, so the top of the range carries the month: a 30 day
 *  drip opens on the same day of each month instead of drifting five days a year off the calendar. */
export const MONTHLY_DRIP_DAYS = 30

/** `d` plus `months` calendar months, clamped to the month's last day (Jan 31 + 1 = Feb 28/29). */
function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime())
  const day = out.getUTCDate()
  out.setUTCDate(1)
  out.setUTCMonth(out.getUTCMonth() + months)
  const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate()
  out.setUTCDate(Math.min(day, last))
  return out
}

/** When phase `phaseIndex` (0-based) unlocks, given the anchor start + drip interval (days). */
export function phaseUnlockAt(anchorStart: Date, phaseIndex: number, dripIntervalDays: number): Date {
  const i = Math.max(0, Math.floor(phaseIndex))
  if (dripIntervalDays === MONTHLY_DRIP_DAYS) return addMonths(anchorStart, i)
  const interval = Math.max(0, dripIntervalDays)
  return new Date(anchorStart.getTime() + i * interval * DAY_MS)
}

/** How many phase openings have passed since the anchor, counting phase 0 as opening 0 (so this is
 *  the index of the phase that opened most recently, without wrapping). -1 before the anchor. */
function openingsElapsed(anchorStart: Date, dripIntervalDays: number, now: Date): number {
  if (now.getTime() < anchorStart.getTime()) return -1
  if (dripIntervalDays === MONTHLY_DRIP_DAYS) {
    let k = (now.getUTCFullYear() - anchorStart.getUTCFullYear()) * 12 + (now.getUTCMonth() - anchorStart.getUTCMonth())
    if (addMonths(anchorStart, k).getTime() > now.getTime()) k -= 1
    return Math.max(0, k)
  }
  const interval = Math.max(0, dripIntervalDays)
  if (interval === 0) return Number.MAX_SAFE_INTEGER
  return Math.floor((now.getTime() - anchorStart.getTime()) / (interval * DAY_MS))
}

/** Has phase `phaseIndex` unlocked by `now`? (Phase 0 is open from the start.) */
export function isPhaseUnlocked(
  anchorStart: Date,
  phaseIndex: number,
  dripIntervalDays: number,
  now: Date = new Date(),
): boolean {
  return now.getTime() >= phaseUnlockAt(anchorStart, phaseIndex, dripIntervalDays).getTime()
}

/** How many of `totalPhases` have unlocked by `now` (1..totalPhases; ≥1 since phase 0 opens immediately). */
export function unlockedPhaseCount(
  anchorStart: Date,
  dripIntervalDays: number,
  totalPhases: number,
  now: Date = new Date(),
): number {
  if (totalPhases <= 0) return 0
  if (Math.max(0, dripIntervalDays) === 0) return totalPhases // no drip → all open
  const unlocked = openingsElapsed(anchorStart, dripIntervalDays, now) + 1 // +1: phase 0 open at t=0
  return Math.min(Math.max(1, unlocked), totalPhases)
}

/** Where an ONGOING Journey is in its yearly cycle (journey_plans.ongoing): which year (1-based),
 *  which phase is current, and when the next one turns over. Once every phase has opened the cycle
 *  starts again at phase 0; nothing locks again and no progress resets, this only names "this
 *  month" and "Year 2" so a member who joins in May lands in May. */
export function ongoingCycle(
  anchorStart: Date | string,
  dripIntervalDays: number,
  totalPhases: number,
  now: Date = new Date(),
): { year: number; phaseIndex: number; nextAt: Date | null } {
  const anchor = new Date(anchorStart)
  const k = totalPhases > 0 ? openingsElapsed(anchor, dripIntervalDays, now) : -1
  if (k === Number.MAX_SAFE_INTEGER) return { year: 1, phaseIndex: 0, nextAt: null }
  if (k < 0) return { year: 1, phaseIndex: 0, nextAt: totalPhases > 0 ? anchor : null }
  return {
    year: Math.floor(k / totalPhases) + 1,
    phaseIndex: k % totalPhases,
    nextAt: phaseUnlockAt(anchor, k + 1, dripIntervalDays),
  }
}

/** The unit a cadence counts its phases in, for labels: "Month 3", "This week". */
export function cadenceUnit(dripIntervalDays: number): 'week' | 'month' {
  return dripIntervalDays === MONTHLY_DRIP_DAYS ? 'month' : 'week'
}

/** One phase's drip state, for a learner surface to render (the course home's week list, the
 *  player's outline). `unlockAt` is null when there is no drip anchor. */
export interface PhaseLockState {
  locked: boolean
  unlockAt: Date | null
}

/** Every phase's drip state in order. No anchor means nothing locks (an author previewing, or a
 *  Journey with no enrolment start on record). */
export function phaseLockStates(
  phaseCount: number,
  anchorStart: Date | string | null,
  dripIntervalDays: number,
  now: Date = new Date(),
): PhaseLockState[] {
  const a = anchorStart ? new Date(anchorStart) : null
  return Array.from({ length: Math.max(0, phaseCount) }, (_, i) =>
    a
      ? { locked: !isPhaseUnlocked(a, i, dripIntervalDays, now), unlockAt: phaseUnlockAt(a, i, dripIntervalDays) }
      : { locked: false, unlockAt: null },
  )
}

/** The member-facing line for a locked phase: "Opens tomorrow", "Opens in 3 days · Mon, Oct 12". */
export function unlockLine(unlockAt: Date | null, now: Date = new Date()): string {
  if (!unlockAt) return 'Locked'
  const days = Math.ceil((unlockAt.getTime() - now.getTime()) / DAY_MS)
  const date = unlockAt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  if (days <= 0) return 'Opening now'
  if (days === 1) return `Opens tomorrow · ${date}`
  return `Opens in ${days} days · ${date}`
}
