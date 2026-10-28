import type { AstroMarker } from '../astro-markers'
import { addDays, mondayOnOrBefore } from './days'

// THE MONTH ENGINE (README 1.3). The grid of one month as day keys, and what the sky says about it:
// the season and its line, the Sun's ingress, the moons. Pure. The sky comes in as the markers the
// server computed (lib/calendar/astro-markers.ts), so none of the ephemeris reaches the browser.

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

export type Season = 'Winter' | 'Spring' | 'Summer' | 'Autumn'

/** The one soft line a month header reads when no season turns inside it. */
const SEASON_LINE: Record<Season, string> = {
  Winter: 'The long nights. Gather close.',
  Spring: 'Days lengthen. Start something.',
  Summer: 'Long light. Take it outside.',
  Autumn: 'The light turns. Slow down.',
}

const SOLAR_POINT: Record<string, { season: Season; name: string }> = {
  'march-equinox': { season: 'Spring', name: 'Spring equinox' },
  'june-solstice': { season: 'Summer', name: 'Summer solstice' },
  'september-equinox': { season: 'Autumn', name: 'Autumn equinox' },
  'december-solstice': { season: 'Winter', name: 'Winter solstice' },
}

/** Month keys are 'YYYY-MM'. Step one by whole months. */
export function shiftMonth(ym: string, delta: number): string {
  const idx = Number(ym.slice(0, 4)) * 12 + (Number(ym.slice(5, 7)) - 1) + delta
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`
}

/** Whole months from `from` to `to`. */
export function monthsBetween(from: string, to: string): number {
  return (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + (Number(to.slice(5, 7)) - Number(from.slice(5, 7)))
}

export function monthName(ym: string): string {
  return MONTH_NAMES[Number(ym.slice(5, 7)) - 1] ?? ym
}

/** The weeks of a month as day keys, Monday first: the Monday on or before the 1st, then rows until
 *  the next row would start in another month (5 or 6 rows). A week that crosses a boundary appears in
 *  both months, and each month blanks the other's days. */
export function monthWeeks(ym: string): string[][] {
  const first = `${ym}-01`
  const weeks: string[][] = []
  let start = mondayOnOrBefore(first)
  for (let w = 0; w < 6; w++) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)))
    const next = addDays(start, 7)
    if (w >= 3 && next.slice(0, 7) !== ym) break
    start = next
  }
  return weeks
}

function ordinal(n: number): string {
  const rule = new Intl.PluralRules('en-US', { type: 'ordinal' }).select(n)
  return `${n}${rule === 'one' ? 'st' : rule === 'two' ? 'nd' : rule === 'few' ? 'rd' : 'th'}`
}

function capital(sign: string): string {
  return sign.charAt(0).toUpperCase() + sign.slice(1)
}

const FALLBACK_POINTS: { md: string; season: Season }[] = [
  { md: '03-20', season: 'Spring' },
  { md: '06-21', season: 'Summer' },
  { md: '09-22', season: 'Autumn' },
  { md: '12-21', season: 'Winter' },
]

/** The season a day sits in, from the equinox and solstice markers when they cover it, else from the
 *  usual dates, so a calendar with the sky switched off still has its four washes. */
export function seasonOn(day: string, markers: readonly AstroMarker[]): Season {
  let best: { day: string; season: Season } | null = null
  for (const m of markers) {
    const point = m.solarPoint && SOLAR_POINT[m.solarPoint]
    if (point && m.day <= day && (!best || m.day > best.day)) best = { day: m.day, season: point.season }
  }
  if (best && day.slice(0, 4) === best.day.slice(0, 4)) return best.season
  const year = day.slice(0, 4)
  let season: Season = 'Winter'
  for (const p of FALLBACK_POINTS) if (day >= `${year}-${p.md}`) season = p.season
  return season
}

export interface MonthSky {
  season: Season
  /** "Autumn begins Sep 22 · Autumn equinox", or the season's own soft line. */
  line: string
  /** "Sun into Scorpio on the 23rd", or empty. */
  ingress: string
  /** The glyph of the sign entered, or empty. */
  ingressSymbol: string
  /** "New Oct 10 · Full Oct 25", or empty. */
  moons: string
}

/** What the sky says about a month. With no markers (the sky switched off) the season still reads. */
export function monthSky(ym: string, markers: readonly AstroMarker[]): MonthSky {
  const mid = `${ym}-15`
  const season = seasonOn(mid, markers)
  const inMonth = markers.filter((m) => m.day.slice(0, 7) === ym)

  const point = inMonth.find((m) => m.solarPoint)
  let line = SEASON_LINE[season]
  if (point?.solarPoint) {
    const def = SOLAR_POINT[point.solarPoint]
    line = `${def.season} begins ${MONTH_SHORT[Number(ym.slice(5, 7)) - 1]} ${Number(point.day.slice(8, 10))} · ${def.name}`
  } else if (!markers.length) {
    const year = ym.slice(0, 4)
    const hit = FALLBACK_POINTS.find((p) => p.md.slice(0, 2) === ym.slice(5, 7))
    if (hit) {
      const names = { Spring: 'Spring equinox', Summer: 'Summer solstice', Autumn: 'Autumn equinox', Winter: 'Winter solstice' }
      line = `${hit.season} begins ${MONTH_SHORT[Number(ym.slice(5, 7)) - 1]} ${Number(`${year}-${hit.md}`.slice(8, 10))} · ${names[hit.season]}`
    }
  }

  const ingress = inMonth.find((m) => m.kind === 'sign-ingress' && m.sign)
  const moons = inMonth
    .filter((m) => m.kind === 'new-moon' || m.kind === 'full-moon')
    .map((m) => `${m.kind === 'new-moon' ? 'New' : 'Full'} ${MONTH_SHORT[Number(m.day.slice(5, 7)) - 1]} ${Number(m.day.slice(8, 10))}`)
    .join(' · ')

  return {
    season,
    line,
    ingress: ingress?.sign ? `Sun into ${capital(ingress.sign)} on the ${ordinal(Number(ingress.day.slice(8, 10)))}` : '',
    ingressSymbol: ingress?.symbol ?? '',
    moons,
  }
}

/** The Sun's sign on a day: the latest ingress on or before it. Null when the markers do not reach. */
export function sunSignOn(day: string, markers: readonly AstroMarker[]): { sign: string; symbol: string } | null {
  let best: AstroMarker | null = null
  for (const m of markers) {
    if (m.kind === 'sign-ingress' && m.sign && m.day <= day && (!best || m.day > best.day)) best = m
  }
  return best?.sign ? { sign: capital(best.sign), symbol: best.symbol } : null
}

/** The sky on one day, for the cell: a moon, an ingress or a solstice, as the one marker to draw. */
export function skyOnDay(day: string, markers: readonly AstroMarker[]): { icon: 'moon' | 'sun' | 'sign'; label: string } | null {
  const hit = markers.filter((m) => m.day === day)
  const m = hit.find((x) => x.solarPoint) ?? hit.find((x) => x.kind === 'sign-ingress') ?? hit[0]
  if (!m) return null
  if (m.kind === 'new-moon') return { icon: 'moon', label: 'New moon' }
  if (m.kind === 'full-moon') return { icon: 'moon', label: 'Full moon' }
  if (m.solarPoint) return { icon: 'sun', label: SOLAR_POINT[m.solarPoint]?.name ?? m.label }
  return { icon: 'sign', label: m.sign ? `Sun into ${capital(m.sign)}` : m.label }
}
