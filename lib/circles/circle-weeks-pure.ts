import { circleStreakWeeks, circleWeekMetQuorum } from './social-fuel'

// The pure half of the Circle's weeks together: week boundaries, bucketing and the streak. No IO, so a
// unit test pins it. Weeks start Monday 00:00 UTC; index 0 is the current week, so far.

export const CIRCLE_WEEKS_SHOWN = 10

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export interface CircleWeekCell {
  /** ISO date of the week's Monday. */
  start: string
  activeMembers: number
  circleSize: number
  met: boolean
}

function mondayUtc(d: Date): number {
  const day = (d.getUTCDay() + 6) % 7
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)
}

/** The last `count` weeks, most recent first. PURE. */
export function bucketCircleWeeks(
  logs: readonly { profile_id: string; created_at: string }[],
  joinedAt: readonly string[],
  now: Date,
  count: number = CIRCLE_WEEKS_SHOWN,
): CircleWeekCell[] {
  const thisMonday = mondayUtc(now)
  const joined = joinedAt.map((j) => Date.parse(j)).filter((t) => Number.isFinite(t))
  return Array.from({ length: count }, (_, i) => {
    const start = thisMonday - i * WEEK_MS
    const end = start + WEEK_MS
    const active = new Set<string>()
    for (const l of logs) {
      const t = Date.parse(l.created_at)
      if (t >= start && t < end) active.add(l.profile_id)
    }
    const circleSize = joined.filter((t) => t < end).length
    return {
      start: new Date(start).toISOString().slice(0, 10),
      activeMembers: active.size,
      circleSize,
      met: circleWeekMetQuorum({ activeMembers: active.size, circleSize }),
    }
  })
}

/** Consecutive weeks kept, ending this week. A week still in progress that has not met the line yet does
 *  not break the streak: it is counted from last week back. PURE. */
export function weeksTogether(weeks: readonly CircleWeekCell[]): number {
  if (weeks.length === 0) return 0
  const [current, ...past] = weeks
  return current.met
    ? circleStreakWeeks(weeks.map((w) => ({ activeMembers: w.activeMembers, circleSize: w.circleSize })))
    : circleStreakWeeks(past.map((w) => ({ activeMembers: w.activeMembers, circleSize: w.circleSize })))
}
