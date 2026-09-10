/**
 * ONE CHECK-IN SURFACE, AND ONE PLACE THAT DECIDES WHAT IT SAYS.
 *
 * Owner, 2026-09-10: *"I want to move and combine both the 'Check in at the door to earn +25 Zaps'
 * line, and the Check In Box from the box editor... I want this feature to be its own dynamic
 * surface that's styled to fit perfectly in the header box."*
 *
 * Check-in was spread across three surfaces that each knew a different amount:
 *
 *   · `EventRewardStrip` in the identity region promised `+25 Zaps` on EVERY event, including the
 *     ones whose host had switched check-in off, because it never read the switch. A promise the
 *     door will refuse is worse than no promise.
 *   · the movable `event-checkin` block printed "Check-in is open" plus the host's door note, but
 *     only while the window was open, so for 99% of an event's life it was an empty slot an
 *     operator had nonetheless placed.
 *   · `EventCheckInButton` in the Join box was the only thing that could actually check you in,
 *     and it lived below the fold.
 *
 * Three surfaces, three different readings of one question. This module is the reading, and the
 * header renders it. The countdown is what ties them together: the same box that says how long
 * until the doors open is the box that opens them, so a member watches one thing rather than
 * learning where the third thing lives at the moment it appears.
 *
 * 🔴 PURE, AND THAT IS THE POINT. Every gate here is already computed on the event page from
 * server-authoritative reads (the host switch, the window, the RSVP, the idempotency row). This
 * function only ORDERS them, so the states are enumerable in a unit test with no session, no
 * deployment and no clock. The component below it renders a state and owns no rules.
 *
 * ⚠️ NOT AN AUTHORIZATION BOUNDARY. `checkInEvent` (app/(main)/events/actions.ts) re-checks all six
 * of its own gates against the database on every call. This decides what to DRAW; the action
 * decides what to allow, and it is the one that counts.
 */

/** What the header's check-in surface should be showing right now. */
export type CheckInSurfaceState =
  /** Nothing to say: cancelled, the host has check-in off, or the door has closed for good. */
  | { readonly kind: 'hidden' }
  /** The doors are not open yet. The surface counts down to `startsAtMs`. */
  | { readonly kind: 'countdown'; readonly startsAtMs: number; readonly zaps: number }
  /** Open, and this viewer can walk through it. The surface becomes the control. */
  | { readonly kind: 'open'; readonly zaps: number }
  /** Open, and this viewer already did. */
  | { readonly kind: 'done'; readonly zaps: number }
  /** Open, but not for this viewer (signed out, or holding no going seat). */
  | { readonly kind: 'waiting'; readonly zaps: number }

export interface CheckInSurfaceInput {
  /** `events.is_cancelled`. */
  readonly cancelled: boolean
  /** The host's switch, `readEventCheckInEnabled(theme)`. Defaults on; only an explicit false is off. */
  readonly checkInEnabled: boolean
  /**
   * The event's real start instant in epoch ms.
   *
   * 🔴 RESOLVE THIS THROUGH `eventInstant(iso, zone)`, NEVER `new Date(starts_at)`. `starts_at`
   * carries the host's WALL CLOCK in UTC parts (lib/time/zone.ts), so the raw string is a
   * seven-hour lie in a Pacific event's own city (ADR-1150). Null when it cannot be parsed, which
   * is the one case with no countdown to draw.
   */
  readonly startsAtMs: number | null
  /** `checkInWindowOpen(...)` — open at the start, shut four hours past the end (ADR-1175). */
  readonly windowOpen: boolean
  /** Is anyone signed in? A guest seat cannot become a counted attendance. */
  readonly signedIn: boolean
  /** Does the viewer hold a `going` RSVP (and not one pending approval)? */
  readonly isGoing: boolean
  /** Did the `event_checkin:<event>:<profile>` idempotency row already come back? */
  readonly alreadyCheckedIn: boolean
  /** `ZAP_AMOUNTS.event_attend`. Zero or less means the reward clause is not printed. */
  readonly zaps: number
  /** Now, in epoch ms. Passed in so the state is testable and the render stays pure. */
  readonly nowMs: number
}

/**
 * Resolve the one state the header surface should be in.
 *
 * ORDER MATTERS AND IS THE WHOLE FUNCTION. Two rules earn their place:
 *
 *  1. **The host's switch outranks the reward line.** `EventRewardStrip` printed "+25 Zaps" without
 *     consulting it, so an event with check-in deliberately off still advertised a reward nobody
 *     could collect. Off now means the surface is silent, which is what off meant everywhere else.
 *  2. **`alreadyCheckedIn` outranks `isGoing`.** The page only fetches that row while the viewer
 *     `canCheckIn`, but a member who cancels an RSVP after checking in would otherwise be told the
 *     door is open to them again. Attendance is a thing that happened; an RSVP is an intention.
 */
export function checkInSurfaceState(input: CheckInSurfaceInput): CheckInSurfaceState {
  const { cancelled, checkInEnabled, startsAtMs, windowOpen, signedIn, isGoing, alreadyCheckedIn, zaps, nowMs } = input

  if (cancelled) return { kind: 'hidden' }
  if (!checkInEnabled) return { kind: 'hidden' }

  const reward = Number.isFinite(zaps) && zaps > 0 ? zaps : 0

  if (windowOpen) {
    if (alreadyCheckedIn) return { kind: 'done', zaps: reward }
    if (signedIn && isGoing) return { kind: 'open', zaps: reward }
    return { kind: 'waiting', zaps: reward }
  }

  // Not open. Either it has not started (count down to it) or the four-hour grace has run out,
  // in which case there is nothing left to say and the header goes quiet rather than carrying a
  // closed notice for the rest of the event's life.
  if (startsAtMs !== null && Number.isFinite(startsAtMs) && nowMs < startsAtMs) {
    return { kind: 'countdown', startsAtMs, zaps: reward }
  }
  return { kind: 'hidden' }
}

/**
 * The countdown clock, as the header prints it.
 *
 * The owner asked for `00:00:00`, and under a day that is exactly what this returns. Past a day an
 * hours-only clock stops being readable ("172:04:11" is a number, not a time), so days lead and the
 * seconds go: nobody watches the seconds tick on a gathering three days out, and a per-second
 * re-render for a digit that changes nothing is wasted work on a phone.
 *
 * Zero-padded and fixed-width on purpose: paired with `tabular-nums` the box does not jitter as the
 * digits change, which is what makes a live clock sit still inside a header row.
 */
export function formatCountdown(remainingMs: number): string {
  const ms = Math.max(0, Math.floor(remainingMs))
  const total = Math.floor(ms / 1000)
  const days = Math.floor(total / 86_400)
  const hours = Math.floor((total % 86_400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')

  if (days > 0) return `${days}d ${pad(hours)}:${pad(minutes)}`
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}
