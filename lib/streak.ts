// Streak milestones — the Duolingo-style checkpoints the feed streak widget (and
// anywhere else that shows a streak) progresses toward. Pure + reusable.

export interface StreakMilestone {
  day: number
  label: string
}

// Friendly, escalating checkpoints. Kept short so the progress feels reachable.
export const STREAK_MILESTONES: StreakMilestone[] = [
  { day: 3, label: 'Spark' },
  { day: 7, label: 'Week' },
  { day: 14, label: 'Fortnight' },
  { day: 30, label: 'Month' },
  { day: 60, label: 'Roots' },
  { day: 100, label: 'Century' },
  { day: 365, label: 'Year' },
]

export interface StreakProgress {
  streak: number
  /** Milestones already reached (day <= streak). */
  reached: StreakMilestone[]
  /** The next checkpoint to chase, or null once every milestone is reached. */
  next: StreakMilestone | null
  /** The last reached checkpoint's day (0 if none) — the start of the current segment. */
  prevDay: number
  /** Days remaining to `next` (0 when maxed). */
  toNext: number
  /** Fill of the current segment, 0..100. 100 when maxed. */
  pct: number
  /** True once the final milestone is reached. */
  maxed: boolean
}

/** Where a streak sits relative to the milestone checkpoints. Pure + unit-tested. */
export function streakProgress(streak: number): StreakProgress {
  const s = Math.max(0, Math.floor(streak || 0))
  const reached = STREAK_MILESTONES.filter((m) => m.day <= s)
  const next = STREAK_MILESTONES.find((m) => m.day > s) ?? null
  const prevDay = reached.length ? reached[reached.length - 1].day : 0
  const maxed = next === null
  const toNext = next ? next.day - s : 0
  const pct = next ? Math.round(((s - prevDay) / (next.day - prevDay)) * 100) : 100
  return { streak: s, reached, next, prevDay, toNext, pct, maxed }
}
