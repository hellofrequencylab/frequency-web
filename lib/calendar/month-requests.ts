// WHICH MONTHS A CALENDAR MOUNT HAS ASKED FOR, AND WHAT CAME BACK. Pure, so the decision the grid
// renders can be replayed without a browser (LIVE-528).
//
// 🔴 THE BUG THIS EXISTS TO MAKE IMPOSSIBLE. The grid used to hold ONE failure: `failedKey`, the
// single month whose fetch had failed. Any other month's fetch cleared it on its way out
// (`setFailedKey(null)` before every request), so a reader who hit a failed October and then paged
// on to a November that loaded fine lost October's "did not load" line for good: coming back to
// October showed an EMPTY month, which is the one thing the grid promises never to show, and the
// Try again that would have refetched it had gone with the line. A month is not the month: the
// answer is a SET keyed by month, and clearing is per key.
import type { CalendarEvent } from '@/lib/calendar/item'
import { safeMonth } from '@/lib/calendar/month-window'

/** One shared empty set of month keys. Frozen, and typed `ReadonlySet`, which is what actually stops
 *  a write; the point of sharing it is IDENTITY, so a reset assigns the same object every time and a
 *  render-time reset cannot schedule another render of its own. */
export const EMPTY_MONTH_KEYS: ReadonlySet<string> = Object.freeze(new Set<string>())

/** The same, for the map of fetched months. */
export const EMPTY_MONTH_ITEMS: ReadonlyMap<string, CalendarEvent[]> = Object.freeze(
  new Map<string, CalendarEvent[]>(),
)

/** `keys` plus `key`. The same set back when it is already in, so React bails out of the render. */
export function withMonth(keys: ReadonlySet<string>, key: string): ReadonlySet<string> {
  if (keys.has(key)) return keys
  const next = new Set(keys)
  next.add(key)
  return next
}

/** `keys` minus `key`, AND NOTHING ELSE: one month's answer never speaks for another's. */
export function withoutMonth(keys: ReadonlySet<string>, key: string): ReadonlySet<string> {
  if (!keys.has(key)) return keys
  const next = new Set(keys)
  next.delete(key)
  return next.size === 0 ? EMPTY_MONTH_KEYS : next
}

/** Does the month on screen have a failed fetch behind it? The error line reads this. */
export function monthDidNotLoad(failed: ReadonlySet<string>, shownKey: string): boolean {
  return failed.has(shownKey)
}

/** The inverse of `monthKey`: 'YYYY-MM' back to its parts, null on anything else. A requester keyed
 *  by month key has to get from the key back to the (year, month1) `loadMonth` takes. */
export function monthFromKey(key: string): { year: number; month1: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key)
  if (!m) return null
  return safeMonth(m[1], m[2])
}
