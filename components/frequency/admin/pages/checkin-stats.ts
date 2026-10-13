// THE CHECK-IN ARITHMETIC THE ADMIN BODIES SHARE (Overview KPIs and chart, Contacts' Last visit and Visits).
// PURE: every function takes the rows the server read (space-reads.ts) and a clock, so the numbers are
// testable and nothing here fetches. A check-in is one row of the verified check-in ledger
// (`engagement_events`, practice.verified, kind event_checkin): who, and when.

export interface CheckinRow {
  profileId: string
  /** Epoch ms of the check-in. */
  at: number
}

export const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS

/** Check-ins whose time falls in [now - fromDays, now - toDays). */
export function countBetween(rows: CheckinRow[], now: number, fromDays: number, toDays = 0): number {
  const start = now - fromDays * DAY_MS
  const end = now - toDays * DAY_MS
  return rows.reduce((sum, r) => (r.at >= start && r.at < end ? sum + 1 : sum), 0)
}

/** Check-ins per week for the last `weeks` weeks, oldest first; the last bucket ends now. */
export function weeklyCounts(rows: CheckinRow[], now: number, weeks = 12): number[] {
  const out = new Array<number>(weeks).fill(0)
  const start = now - weeks * WEEK_MS
  for (const r of rows) {
    if (r.at < start || r.at >= now) continue
    const i = Math.min(weeks - 1, Math.floor((r.at - start) / WEEK_MS))
    out[i] += 1
  }
  return out
}

/** A whole-percent change from `prior` to `current`, or null when there is no prior reading to compare. */
export function percentChange(current: number, prior: number): number | null {
  if (!Number.isFinite(prior) || prior <= 0) return null
  return Math.round(((current - prior) / prior) * 100)
}

/**
 * "Came back within 2 weeks". The people who checked in between 44 and 14 days ago (so two full weeks of
 * follow-up have passed), and of them the share whose next check-in came within 14 days of that first one.
 * Returns null when nobody checked in in that window (no reading, not zero).
 */
export function returnRate(rows: CheckinRow[], now: number, windowDays = 30, withinDays = 14): { rate: number; people: number } | null {
  const end = now - withinDays * DAY_MS
  const start = end - windowDays * DAY_MS
  const byPerson = new Map<string, number[]>()
  for (const r of rows) {
    const list = byPerson.get(r.profileId)
    if (list) list.push(r.at)
    else byPerson.set(r.profileId, [r.at])
  }
  let people = 0
  let returned = 0
  for (const times of byPerson.values()) {
    times.sort((a, b) => a - b)
    const first = times.find((t) => t >= start && t < end)
    if (first === undefined) continue
    people += 1
    if (times.some((t) => t > first && t <= first + withinDays * DAY_MS)) returned += 1
  }
  if (people === 0) return null
  return { rate: Math.round((returned / people) * 100), people }
}

/** Each person's visit count and last visit (epoch ms). */
export function visitsByProfile(rows: CheckinRow[]): Map<string, { visits: number; last: number }> {
  const out = new Map<string, { visits: number; last: number }>()
  for (const r of rows) {
    const cur = out.get(r.profileId)
    if (cur) {
      cur.visits += 1
      if (r.at > cur.last) cur.last = r.at
    } else out.set(r.profileId, { visits: 1, last: r.at })
  }
  return out
}

/** People whose FIRST check-in here falls in the last `days` days. */
export function firstTimers(rows: CheckinRow[], now: number, days = 7): number {
  const first = new Map<string, number>()
  for (const r of rows) {
    const cur = first.get(r.profileId)
    if (cur === undefined || r.at < cur) first.set(r.profileId, r.at)
  }
  const since = now - days * DAY_MS
  let count = 0
  for (const at of first.values()) if (at >= since && at < now) count += 1
  return count
}

/** Bar heights for the kit's `.bars` chart, in whole percent of the tallest week (a zero week keeps a sliver
 *  so the axis still reads). */
export function barHeights(values: number[]): number[] {
  const max = Math.max(0, ...values)
  if (max <= 0) return values.map(() => 3)
  return values.map((v) => Math.max(3, Math.round((v / max) * 100)))
}
