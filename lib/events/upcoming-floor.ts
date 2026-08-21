import { HOME_TZ, dayInZone } from '@/lib/time/zone'
import { seriesUpcomingFloor } from './series'

// ── THE FLOOR FOR "UPCOMING" on every member-facing event read ───────────────────────────────────
//
// 🔴 `new Date().toISOString()` IS WRONG AS AN events.starts_at LOWER BOUND, and it is wrong twice.
// That column stores the wall-clock as UTC PARTS, so comparing it to a real instant:
//
//   1. drops an event THE MOMENT IT STARTS rather than at the end of its day — a member opening the
//      app at 7:05pm has already lost the 7pm gathering they are walking to; and
//   2. drops TONIGHT ENTIRELY once UTC rolls past midnight, i.e. about 5pm Pacific, because "now"
//      in UTC parts has already become tomorrow. Every evening, the evening's events vanish.
//
// The right floor is the start of TODAY in the community's own zone, written the same way the column
// is. /events, /discover, search, the Circle blocks, the rail and the tickets projection have always
// used it; a long tail of other surfaces used the raw instant instead.
//
// WHY THIS IS ITS OWN MODULE AND NOT A FUNCTION IN series.ts: that file has ZERO IMPORTS on purpose,
// so it stays importable from a client component without dragging lib/time/zone.ts's tz-lookup
// dataset into the bundle. Its header calls the caller-supplied floor "not an oversight, it is the
// seam". This module is the server-side half of that seam, so the seam survives and callers still
// get one function instead of two lines they can get subtly out of step.

/**
 * The start of today in the community's zone, as an `events.starts_at` bound.
 * `now` is injectable so a test can pin the 5pm boundary instead of waiting for it.
 */
export function upcomingEventFloor(now: Date = new Date()): string {
  return seriesUpcomingFloor(dayInZone(now, HOME_TZ))
}
