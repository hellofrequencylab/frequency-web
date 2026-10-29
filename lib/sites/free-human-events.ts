import { expandSiteSeries, storedWallClock, type SiteEventRow } from '@/lib/sites/site-events'
import { freeHumanKindMeta, type FreeHumanOcc } from '@/lib/sites/free-human-calendar'

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
const KIND_MATCH: readonly { id: string; match: RegExp }[] = [
  { id: 'workshop', match: /workshop|intensive|masterclass/i },
  { id: 'retreat', match: /retreat/i },
  { id: 'moon', match: /\b(full|new) moon|moon (circle|gathering)/i },
  { id: 'turn', match: /solstice|equinox|samhain|beltane|imbolc|lammas/i },
  { id: 'program', match: /\b(winter|spring|summer|autumn|fall)\b.*\b(opens|begins|starts)\b|\b(opens|begins)\b.*\bseason/i },
  { id: 'book', match: /\bbook\b|launch|signing/i },
]

/** An event's kind: the first kind whose words its title carries, else a circle. */
export function freeHumanKind(title: string): { id: string; label: string; glyph: string } {
  const { id, label, glyph } = freeHumanKindMeta(KIND_MATCH.find((x) => x.match.test(title))?.id ?? 'circle')
  return { id, label, glyph }
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

/** The Space's gatherings across the next `months` months as the Calendar block draws them: the series expanded, cancelled and
 *  finished ones dropped, each with its kind, its place and price lines and the page it links to (`pageOf` builds that from the
 *  row, '' for none). */
export function freeHumanOccurrences(space: { events?: unknown; series?: unknown } | undefined, now: Date, months: number, pageOf: (e: FreeHumanEventRow) => string): FreeHumanOcc[] {
  if (!space) return []
  const seen = new Set<string>()
  const own: FreeHumanEventRow[] = []
  for (const e of [...(Array.isArray(space.events) ? space.events : []), ...(Array.isArray(space.series) ? space.series : [])]) {
    if (!isRow(e) || seen.has(e.id)) continue
    seen.add(e.id)
    own.push(e)
  }
  const through = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months, 1))
  const today = now.toISOString().slice(0, 10)
  return expandSiteSeries(own, { through, from: now })
    .filter((e) => !e.isCancelled && (e.endsAt ?? e.startsAt).slice(0, 10) >= today && e.startsAt.slice(0, 10) < through.toISOString().slice(0, 10))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((e) => ({
      id: e.id,
      title: e.title,
      kind: freeHumanKind(e.title).id,
      startsAt: e.startsAt.slice(0, 16),
      endsAt: e.endsAt ? e.endsAt.slice(0, 16) : null,
      place: (e.location ?? '').trim(),
      price: (e.priceLabel ?? '').trim(),
      summary: (e.description ?? '').trim(),
      href: pageOf(e),
      recurring: !!e.parentEventId || (!!e.recurrenceType && e.recurrenceType !== 'none'),
    }))
}
