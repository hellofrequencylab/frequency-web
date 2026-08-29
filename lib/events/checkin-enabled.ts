// CHECK-IN for an event: whether the host wants the check-in door open at all.
//
// Check-in is right for a gathering where showing up is the thing being marked — a class, a
// weekly cowork, anything with a door. It is wrong for a planning session, a long multi-day
// working block, or a private invite where the only question is "are you coming". Until now
// every event got check-in the moment it started, whether the host wanted it or not, and there
// was no way to say no.
//
// This is the host's switch. It gates the SURFACES (the "Check-in is open" block, the check-in
// button on the detail page, the signed-out check-in door) and the `checkInEvent` action itself,
// so turning it off actually closes the door rather than only hiding the handle.
//
// STORAGE: the existing `events.theme` jsonb bag, under `checkInEnabled`, alongside
// `marketListed` (lib/events/market-listing.ts), `coverFocus` and `heroHeight`. NO new column and
// NO migration — the same reasoning ADR-844 used for public listing. Enabled is the DEFAULT, so
// the key is only ever written when a host opts OUT, and every event that exists today keeps
// behaving exactly as it does now.
//
// Pure + total, so it is safe on both sides of the wire.

/** The theme key. Present and `false` = check-in off; absent = on (the default). */
const KEY = 'checkInEnabled'

/**
 * Is check-in open for this event? Defaults to TRUE, so an event that has never touched the
 * control (which is all of them today) behaves exactly as it does now. Only an explicit stored
 * `false` turns it off; any other value is treated as enabled, which fails OPEN on purpose —
 * closing a host's door because of a malformed theme bag would be the worse failure, and the
 * time window (started, not ended) still gates it either way.
 */
export function readEventCheckInEnabled(theme: unknown): boolean {
  if (theme && typeof theme === 'object') {
    const v = (theme as Record<string, unknown>)[KEY]
    if (v === false) return false
  }
  return true
}

/**
 * Merge the choice into an existing theme object. Writing `true` DELETES the key rather than
 * storing it, so the stored theme stays sparse and "check-in on" remains a true default rather
 * than a value every row has to carry. Returns the next theme.
 */
export function writeEventCheckInEnabled(theme: unknown, enabled: boolean): Record<string, unknown> {
  const base = theme && typeof theme === 'object' ? { ...(theme as Record<string, unknown>) } : {}
  if (enabled) delete base[KEY]
  else base[KEY] = false
  return base
}

/** The host-facing copy for the control, kept next to the rule so surface and meaning cannot drift. */
export const CHECK_IN_LABEL = 'Let guests check in'
export const CHECK_IN_HELP =
  'On, people who are going can mark that they showed up once the event starts. Off, there is no check-in and RSVPs are the whole answer.'
