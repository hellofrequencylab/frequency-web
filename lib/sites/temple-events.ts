import { storedWallClock } from '@/lib/sites/site-events'

// THE TEMPLE'S EVENT LINES (design: "Sun Oct 25 · 5–7 PM" and the clay date stamp). Every start is the stored
// wall clock as UTC parts (lib/time/zone.ts), so the day and the hour are read from the UTC parts as they
// are: no zone round trip, no machine clock. PURE.

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The stamp's two lines: the day of the month and the month, upper-cased by the skin. Null for an unreadable start. */
export function templeStamp(startsAt: string): { day: string; month: string } | null {
  const d = storedWallClock(startsAt)
  return d ? { day: String(d.getUTCDate()), month: MONTHS[d.getUTCMonth()] } : null
}

function hour(d: Date): { h: number; ap: 'AM' | 'PM'; m: number } {
  const h24 = d.getUTCHours()
  return { h: h24 % 12 === 0 ? 12 : h24 % 12, ap: h24 < 12 ? 'AM' : 'PM', m: d.getUTCMinutes() }
}

const clock = (t: { h: number; m: number }) => (t.m ? `${t.h}:${String(t.m).padStart(2, '0')}` : String(t.h))

/** "Sun Oct 25 · 5–7 PM": the day, then the hours, the period once when the start and end share it. */
export function templeWhen(startsAt: string, endsAt?: string | null): string | null {
  const s = storedWallClock(startsAt)
  if (!s) return null
  const e = endsAt ? storedWallClock(endsAt) : null
  const a = hour(s)
  const day = `${DAYS[s.getUTCDay()]} ${MONTHS[s.getUTCMonth()]} ${s.getUTCDate()}`
  if (!e || e.getTime() <= s.getTime()) return `${day} · ${clock(a)} ${a.ap}`
  const b = hour(e)
  return a.ap === b.ap ? `${day} · ${clock(a)}–${clock(b)} ${b.ap}` : `${day} · ${clock(a)} ${a.ap}–${clock(b)} ${b.ap}`
}
