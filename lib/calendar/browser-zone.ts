// WHAT ZONE A NEW DATE IS WRITTEN IN (LIVE-468, then LIVE-471).
//
// LIVE-468 put the viewer's zone here once, because the staff drawer and the Ask Vera box each
// carried a copy of it. LIVE-471 is the reason that was the wrong DEFAULT: a travelling operator
// penciling Saturday from an airport wrote the airport's wall clock into a calendar everyone else
// reads in the Space's zone. So the default is now the SPACE's own zone (spaces.time_zone), and the
// browser is what is left when the Space has never said.
//
// One export per question, and both are total:
//   • `spaceTimeZone` is the fact the Space stores, threaded from the server as a prop.
//   • `newDateZone(spaceTimeZone)` is the ANSWER a create surface uses. Call this one.
//   • `browserZone()` is the last resort, exported because it is also the honest thing to SHOW
//     ("Local time") when a Space has no zone yet.
//
// Client only, and deliberately import-free: the house zone (lib/time/zone.ts HOME_TZ) is restated
// here rather than imported so this module does not pull the tz tables into a client bundle for one
// string.

const FALLBACK_ZONE = 'America/Los_Angeles'

/** The browser's IANA zone, or the house zone when the browser cannot say. Client only. */
export function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_ZONE
  } catch {
    return FALLBACK_ZONE
  }
}

/**
 * The zone a NEW date is written in, in the one order the whole calendar agrees on:
 *
 *   1. the Space's own zone (`spaces.time_zone`), which is the Space saying where its schedule is;
 *   2. the viewer's browser zone, only when the Space has never said;
 *   3. the house zone, only when the browser cannot say either (`browserZone` handles that step).
 *
 * Total: a null, a blank or a whitespace-only Space zone all mean "not said" and fall through, so a
 * half-written settings value can never become a date's zone.
 */
export function newDateZone(spaceTimeZone: string | null | undefined): string {
  const stored = (spaceTimeZone ?? '').trim()
  return stored || browserZone()
}
