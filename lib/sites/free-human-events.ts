import { expandSiteSeries, storedWallClock, type SiteEventRow } from '@/lib/sites/site-events'

// THE FREE HUMAN EVENT LINES (design: the Events block's date numeral and the Workshops block's "Sun · Nov 15 · Online" line).
// Every start is the stored wall clock as UTC parts (lib/time/zone.ts), so the day and the month are read from the UTC parts as they
// are: no zone round trip, no machine clock. PURE: no React, no Next, no database.

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WINDOW_DAYS = 120

/** One event the live blocks read: the lean shape the Space's data bag carries (lib/spaces/content-data.ts SpaceEventItem). */
export interface FreeHumanEventRow extends SiteEventRow {
  description?: string | null
  location?: string | null
  priceLabel?: string | null
  coverUrl?: string | null
}

const isRow = (e: unknown): e is FreeHumanEventRow =>
  !!e && typeof (e as FreeHumanEventRow).id === 'string' && typeof (e as FreeHumanEventRow).title === 'string' && typeof (e as FreeHumanEventRow).startsAt === 'string'

/** The kinds of gathering the design draws, each with the glyph that stands for it. An event has no tag field yet, so the kind is
 *  read from its title (a title with "full moon" is a moon gathering); a plain event is a circle. */
const KINDS: readonly { id: string; label: string; glyph: string; match: RegExp }[] = [
  { id: 'workshop', label: 'Workshop', glyph: 'bloom', match: /workshop|intensive|masterclass/i },
  { id: 'retreat', label: 'Retreat', glyph: 'temple', match: /retreat/i },
  { id: 'moon', label: 'Moon gathering', glyph: 'full-moon', match: /\b(full|new) moon|moon (circle|gathering)/i },
  { id: 'turn', label: 'Turn of the year', glyph: 'sun-sign', match: /solstice|equinox|samhain|beltane|imbolc|lammas/i },
  { id: 'program', label: 'Season opens', glyph: 'half-moon', match: /\b(winter|spring|summer|autumn|fall)\b.*\b(opens|begins|starts)\b|\b(opens|begins)\b.*\bseason/i },
  { id: 'book', label: 'Book', glyph: 'library', match: /\bbook\b|launch|signing/i },
]

/** An event's kind: the first kind whose words its title carries, else a circle. */
export function freeHumanKind(title: string): { id: string; label: string; glyph: string } {
  const k = KINDS.find((x) => x.match.test(title))
  return k ? { id: k.id, label: k.label, glyph: k.glyph } : { id: 'circle', label: 'Circle', glyph: 'gathering' }
}

/** The Space's upcoming events from its data bag (its own rows and its series, every recurring anchor expanded through the next
 *  four months), cancelled ones dropped, soonest first. Empty when the bag carries none. */
export function freeHumanUpcoming(space: { events?: unknown; series?: unknown } | undefined, now: Date): FreeHumanEventRow[] {
  if (!space) return []
  const seen = new Set<string>()
  const own: FreeHumanEventRow[] = []
  for (const e of [...(Array.isArray(space.events) ? space.events : []), ...(Array.isArray(space.series) ? space.series : [])]) {
    if (!isRow(e) || seen.has(e.id)) continue
    seen.add(e.id)
    own.push(e)
  }
  const rows = expandSiteSeries(own, { through: new Date(now.getTime() + WINDOW_DAYS * 86_400_000), from: now })
  const today = now.toISOString().slice(0, 10)
  return rows.filter((e) => !e.isCancelled && e.startsAt.slice(0, 10) >= today).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

/** The numeral's two lines: "05" and "NOV". Null for an unreadable start. */
export function freeHumanStamp(startsAt: string): { day: string; month: string } | null {
  const d = storedWallClock(startsAt)
  return d ? { day: String(d.getUTCDate()).padStart(2, '0'), month: MONTHS[d.getUTCMonth()].toUpperCase() } : null
}

/** "Sun · Nov 15": the day line over a workshop. Empty for an unreadable start. */
export function freeHumanDayLine(startsAt: string): string {
  const d = storedWallClock(startsAt)
  return d ? `${DAYS[d.getUTCDay()]} · ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}` : ''
}
