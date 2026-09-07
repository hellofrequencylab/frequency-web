// WHEN IS IT A MEMBER'S MORNING? (LIVE-193, ADR-1225)
//
// The Journey prompt cron fires every hour and asks this for each enrolled member, so one UTC
// schedule yields a local morning for everyone. A leaf on purpose: the route imports it, and a
// Next.js route file may only export its handlers, so the constants and the pure decision live here
// where the test can reach them.

import { dayInZone, hourInZone } from '@/lib/time/zone'

/** The local hour a member with a home timezone gets their prompt. 8am: after the alarm, before the
 *  day fills, and never inside a DST gap (only 02:00 is ever skipped). */
export const LOCAL_MORNING_HOUR = 8

/** The UTC hour a member WITHOUT a timezone gets their prompt: the old `0 13 * * *` schedule, kept
 *  verbatim so the change is invisible to anyone it cannot improve. */
export const LEGACY_UTC_HOUR = 13

/** Is it this member's morning right now? With a zone: `LOCAL_MORNING_HOUR` there. Without one:
 *  `LEGACY_UTC_HOUR`, the old daily schedule. Returns the member's local day beside the answer so
 *  the dedupe key and the push tag are stamped with the day THEY are living, not the server's. */
export function morningFor(now: Date, timezone: string | undefined): { due: boolean; day: string } {
  if (timezone) return { due: hourInZone(now, timezone) === LOCAL_MORNING_HOUR, day: dayInZone(now, timezone) }
  return { due: now.getUTCHours() === LEGACY_UTC_HOUR, day: now.toISOString().slice(0, 10) }
}
