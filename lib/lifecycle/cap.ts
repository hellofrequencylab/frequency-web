// THE CROSS-EMAIL CAP (EMAIL-047), the pure half. Daniel's rule (2026-11-13): at most one lifecycle email per person per day
// and three per rolling week. A rank 1 email (someone is waiting on it, lib/lifecycle/registry.ts) is never held by the
// daily cap but still counts toward the week, so it cannot be starved by what came before. PURE: the log read and the
// claim are lib/lifecycle/cap-io.ts.

import { lifecycleRank } from './registry.ts'

const DAILY_CAP = 1
const WEEKLY_CAP = 3
const DAY_MS = 86_400_000

/** EMAIL-084 (Daniel, 2026-11-19, "One per 7 days"): kinds that are marketing. At most MARKETING_WEEKLY_CAP of them reach
 *  one person per rolling 7 days, on top of the daily and weekly lifecycle caps above. */
export const MARKETING_KINDS: ReadonlySet<string> = new Set(['campaign'])
const MARKETING_WEEKLY_CAP = 1

interface RecentSend {
  kind: string
  sentAt: string
}

type CapDecision = { allowed: true } | { allowed: false; why: 'daily' | 'weekly' | 'weekly_marketing'; retryAfter: string }

const ms = (iso: string): number => Date.parse(iso)

/** Whether `kind` may go to a person now, given what they were already sent. Unreadable timestamps are ignored. */
export function capDecision(now: Date, kind: string, recent: readonly RecentSend[]): CapDecision {
  const t = now.getTime()
  const times = recent.map((r) => ms(r.sentAt)).filter((x) => Number.isFinite(x) && x <= t).sort((a, b) => a - b)
  const inWeek = times.filter((x) => t - x < 7 * DAY_MS)
  if (inWeek.length >= WEEKLY_CAP) {
    const oldest = inWeek[inWeek.length - WEEKLY_CAP]
    return { allowed: false, why: 'weekly', retryAfter: new Date(oldest + 7 * DAY_MS).toISOString() }
  }
  if (MARKETING_KINDS.has(kind)) {
    const marketing = recent
      .filter((r) => MARKETING_KINDS.has(r.kind))
      .map((r) => ms(r.sentAt))
      .filter((x) => Number.isFinite(x) && x <= t && t - x < 7 * DAY_MS)
      .sort((a, b) => a - b)
    if (marketing.length >= MARKETING_WEEKLY_CAP) {
      const oldest = marketing[marketing.length - MARKETING_WEEKLY_CAP]
      return { allowed: false, why: 'weekly_marketing', retryAfter: new Date(oldest + 7 * DAY_MS).toISOString() }
    }
  }
  const inDay = times.filter((x) => t - x < DAY_MS)
  if (inDay.length >= DAILY_CAP && lifecycleRank(kind) > 1) {
    return { allowed: false, why: 'daily', retryAfter: new Date(inDay[inDay.length - DAILY_CAP] + DAY_MS).toISOString() }
  }
  return { allowed: true }
}
