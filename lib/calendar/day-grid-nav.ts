// THE DAY GRID'S KEYBOARD (the Frequency calendar planner). Pure date-key arithmetic for a month grid
// whose weeks run Sunday to Saturday (lib/events/calendar-grid.ts monthMatrix). Every day is a
// 'YYYY-MM-DD' key read in UTC, so a key never shifts with the viewer's own zone: what the server and
// the browser compute for the same key is the same key.

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

function at(dayKey: string): Date | null {
  if (!DAY_KEY.test(dayKey)) return null
  const d = new Date(`${dayKey}T00:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

function key(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** The day `delta` days from `dayKey` (negative goes back). The key itself when it is not a day. */
export function stepDay(dayKey: string, delta: number): string {
  const d = at(dayKey)
  if (!d) return dayKey
  d.setUTCDate(d.getUTCDate() + delta)
  return key(d)
}

/** The Sunday that opens, or the Saturday that closes, the week `dayKey` sits in. */
export function weekEdge(dayKey: string, edge: 'start' | 'end'): string {
  const d = at(dayKey)
  if (!d) return dayKey
  const dow = d.getUTCDay()
  return stepDay(dayKey, edge === 'start' ? -dow : 6 - dow)
}

/** Saturday or Sunday. */
export function isWeekendDay(dayKey: string): boolean {
  const d = at(dayKey)
  if (!d) return false
  const dow = d.getUTCDay()
  return dow === 0 || dow === 6
}

/** Where a key press on a focused day goes, or null for a key the grid does not move on. */
export function dayForKey(dayKey: string, k: string): string | null {
  switch (k) {
    case 'ArrowLeft':
      return stepDay(dayKey, -1)
    case 'ArrowRight':
      return stepDay(dayKey, 1)
    case 'ArrowUp':
      return stepDay(dayKey, -7)
    case 'ArrowDown':
      return stepDay(dayKey, 7)
    case 'Home':
      return weekEdge(dayKey, 'start')
    case 'End':
      return weekEdge(dayKey, 'end')
    default:
      return null
  }
}

/** Today's day key in a named zone (the Space's, else America/Los_Angeles), for a server render and
 *  the browser to agree on. Falls back to the UTC day when the zone is not one Intl knows. */
export function dayKeyIn(zone: string | null | undefined, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: zone || 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}
