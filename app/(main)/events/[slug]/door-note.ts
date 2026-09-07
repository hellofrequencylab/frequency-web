// What the QR door tells the person holding the phone (LIVE-157, ADR-1208).
//
// SCAN-566 made the printed-code route (app/q/[slug]/route.ts) report WHY a scan did not check
// someone in: it redirects to `/events/<slug>?door=<reason>` instead of landing them on the page
// with nothing to say. The page then read `ticket` / `session_id` / `claimed` / `claim` and
// ignored `door`, so the reason rode the URL and was shown to nobody. This is the missing half.
//
// THE REASONS are fixed tokens, never copy: `CheckInFailReason` from the events actions
// (`signed_out` / `unavailable` / `window_closed` / `checkin_off` / `not_going` / `pending`) plus
// the two the door adds on top (`rsvp_refused` when the RSVP write itself was refused, `failed`
// when an action threw). Each surface writes its own sentence, and this file is the event page's.
//
// VOICE (docs/CONTENT-VOICE.md §10). One line each, plain, no em dashes, sentence case. Every line
// says what happened and what to do next, and none of them narrates how the reader feels about
// standing at a door that did not open. They lead with the scan rather than the member ("your scan
// did not check you in", not "you are not checked in") because the scan is the thing that just
// happened and the thing they can repeat.
//
// A `door` value that is not in this map renders NOTHING. The value arrives in a URL anyone can
// type, so an unknown token is treated as noise rather than shown as a message.

/** The reasons the door can report. Mirrors `DoorOutcome` in app/q/[slug]/route.ts. */
export const DOOR_REASONS = [
  'signed_out',
  'unavailable',
  'window_closed',
  'checkin_off',
  'not_going',
  'pending',
  'rsvp_refused',
  'failed',
] as const

export type DoorReason = (typeof DOOR_REASONS)[number]

const DOOR_NOTES: Record<DoorReason, string> = {
  signed_out: 'Your scan did not check you in. Sign in, then scan again.',
  unavailable: 'Your scan did not check you in. This event is not taking check-ins.',
  window_closed:
    'Your scan did not check you in. Check-in opens when the event starts and closes a few hours after it ends.',
  checkin_off: 'Your scan did not check you in. The host is not using check-in for this one.',
  not_going: 'Your scan did not check you in. Answer Going first, then scan again.',
  pending: 'Your scan did not check you in. The host still has your request to approve.',
  rsvp_refused: 'Your scan did not save an RSVP. Answer below instead.',
  failed: 'Something went wrong at the door. Try scanning again, or answer below.',
}

/** The one line to show for a `?door=` value, or null when there is nothing honest to say. */
export function doorNoteFor(reason: string | undefined | null): string | null {
  if (!reason) return null
  // `Object.hasOwn`, not a plain index: the value comes off a URL, and a plain lookup answers
  // `?door=constructor` with a function rather than null.
  return Object.hasOwn(DOOR_NOTES, reason) ? DOOR_NOTES[reason as DoorReason] : null
}
