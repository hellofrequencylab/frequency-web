// WHEN THE CHECK-IN DOOR IS OPEN.
//
// Two questions gate check-in and they are different. `lib/events/checkin-enabled.ts` answers
// whether the host wants a door at all. This answers whether the door is open right now.
//
// THE BUG THIS CLOSES (ADR-1175). `checkInEvent` guarded only that the event had STARTED:
//
//     if (!ev || ev.is_cancelled || !isEventPast(ev.starts_at, null, tz)) return { ok: false }
//
// There was no upper bound anywhere, in the action or in the QR door it backs (app/q/[slug]).
// So every event a member had ever RSVP'd going to stayed checkable forever, and checking in to
// a gathering that ended in March still paid Zaps, ticked the attendance streak and counted
// toward verified-member standing. Attendance is a claim about a room someone stood in; a claim
// with no expiry is not attendance, it is a button.
//
// THE RULE: open from the start, shut GRACE_HOURS after the end (or after the start, for an event
// with no end time). Four hours is deliberate slack rather than precision — it covers the late
// walk-in, the person who remembers in the car, and the host who runs long, without leaving a
// month-old event payable. It is not a security boundary; it is the honest edge of "was there".
//
// TIME: `starts_at` / `ends_at` carry the event's WALL CLOCK in UTC parts (lib/time/zone.ts), so
// both sides resolve through `eventInstant` in the event's own zone. Comparing the raw stored
// string to `new Date()` is the seven-hours-early bug ADR-1150 fixed on the guest door.
//
// Pure and total, so the action, the page and the QR route all read one rule.

import { eventInstant } from '@/lib/time/zone'

/** How long past the end a check-in still counts. */
export const CHECK_IN_GRACE_HOURS = 4
const GRACE_MS = CHECK_IN_GRACE_HOURS * 60 * 60 * 1000

/**
 * Is the check-in door open for this event right now?
 *
 * Opens at the start instant and shuts GRACE_HOURS past `endsAt` (falling back to `startsAt` when
 * the host set no end time). An event whose start cannot be parsed answers `false`: with no start
 * there is no window, and paying for a check-in we cannot place in time is the worse direction.
 */
export function checkInWindowOpen(
  startsAtIso: string | null | undefined,
  endsAtIso: string | null | undefined,
  zone: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const start = eventInstant(startsAtIso, zone)
  if (!start) return false
  if (now.getTime() < start.getTime()) return false

  // An `ends_at` BEFORE the start is a bad row, not a zero-length event: fall back to the start so
  // a data slip cannot shut the door on a gathering that is happening right now.
  const end = eventInstant(endsAtIso, zone)
  const close = (end && end.getTime() > start.getTime() ? end : start).getTime() + GRACE_MS
  return now.getTime() < close
}

/** The line a member sees where the check-in control used to be. No em dashes (CONTENT-VOICE §10). */
export const CHECK_IN_CLOSED_NOTE = 'Check-in for this one has closed.'
