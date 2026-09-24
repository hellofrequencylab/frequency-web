// WHOSE ZONE A CALENDAR HEADER NAMES (LIVE-471).
//
// The Calendar console prints a zone beside the month. Before this row it printed the VIEWER's zone
// as an abbreviation, so an operator working from an airport read "WEST" over a calendar their team
// keeps in Pacific Time. The rule is one line and it lives here rather than inside the console, so a
// backlog probe can RUN it: scripts/probe-ts.mjs cannot import a .tsx, and a decision that only
// exists inside a component is a decision no probe can measure (LIVE-478).
//
// PURE and total: no Intl, no dates, no imports beyond the words table. The caller hands in whatever
// the viewer's own zone is (lib/calendar/browser-zone.ts reads that), so this module is the same in
// a test, on a server and in a browser.

import { zoneWords } from './zone-words'

export interface HeaderZone {
  /** The IANA value, for the tooltip and for saying WHOSE zone this is. Empty when nothing said. */
  name: string
  /** What the header SHOWS: plain words, never a raw identifier and never a seasonal abbreviation. */
  words: string
  /** True when the words are the Space's own zone rather than the person's. */
  isSpaceZone: boolean
}

/**
 * The zone a calendar header names: the Space's own zone when it has said one, otherwise the
 * viewer's. A blank or whitespace-only Space value means "never said" and falls through, the same
 * way `newDateZone` treats it, so the header and the zone a new date is written in cannot disagree.
 */
export function headerZone(
  spaceTimeZone: string | null | undefined,
  viewerZone: string | null | undefined,
): HeaderZone {
  const stored = (spaceTimeZone ?? '').trim()
  if (stored) return { name: stored, words: zoneWords(stored), isSpaceZone: true }
  const viewer = (viewerZone ?? '').trim()
  return { name: viewer, words: zoneWords(viewer), isSpaceZone: false }
}
