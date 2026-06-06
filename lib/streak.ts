// Streak milestones — the Duolingo-style checkpoints the feed streak widget (and
// anywhere else that shows a streak) progresses toward. Pure + reusable.

export interface StreakMilestone {
  day: number
  label: string
  /** Zaps paid the first time a member reaches this checkpoint (real-life act →
   *  zaps, ADR-139). Drives season rank. */
  zaps: number
  /** Whether reaching this checkpoint also banks a streak-freeze token (capped). */
  freeze: boolean
}

// Friendly, escalating checkpoints. Kept short so the progress feels reachable.
// Rewards escalate with commitment; a freeze token is banked at the weekly+ marks
// so a single missed day can be absorbed once a member has built real momentum.
export const STREAK_MILESTONES: StreakMilestone[] = [
  { day: 3,   label: 'Spark',     zaps: 10,  freeze: false },
  { day: 7,   label: 'Week',      zaps: 25,  freeze: true  },
  { day: 14,  label: 'Fortnight', zaps: 40,  freeze: false },
  { day: 30,  label: 'Month',     zaps: 75,  freeze: true  },
  { day: 60,  label: 'Roots',     zaps: 120, freeze: false },
  { day: 100, label: 'Century',   zaps: 200, freeze: true  },
  { day: 365, label: 'Year',      zaps: 500, freeze: true  },
]

/** Most freeze tokens a member can bank at once. A freeze auto-bridges a single
 *  missed day so one slip doesn't erase weeks of momentum. */
export const STREAK_FREEZE_CAP = 2

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
