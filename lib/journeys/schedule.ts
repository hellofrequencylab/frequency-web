// Journeys v2 — the phase DRIP schedule (ADR-252, docs/JOURNEYS.md §3). Pure + deterministic
// so it's unit-tested and shared by the Run view, the solo view, and notifications. Phase 0
// (the first phase) unlocks at the start; each later phase unlocks one drip interval after the
// previous. The anchor is the Run's `started_at` (cohort) or the enrollment's `started_at`
// (solo) — the caller passes whichever applies. Once unlocked a phase stays open (catch-up).

const DAY_MS = 86_400_000

/** When phase `phaseIndex` (0-based) unlocks, given the anchor start + drip interval (days). */
export function phaseUnlockAt(anchorStart: Date, phaseIndex: number, dripIntervalDays: number): Date {
  const i = Math.max(0, Math.floor(phaseIndex))
  const interval = Math.max(0, dripIntervalDays)
  return new Date(anchorStart.getTime() + i * interval * DAY_MS)
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
  const interval = Math.max(0, dripIntervalDays)
  if (interval === 0) return totalPhases // no drip → all open
  const elapsedDays = Math.max(0, (now.getTime() - anchorStart.getTime()) / DAY_MS)
  const unlocked = Math.floor(elapsedDays / interval) + 1 // +1: phase 0 open at t=0
  return Math.min(Math.max(1, unlocked), totalPhases)
}
