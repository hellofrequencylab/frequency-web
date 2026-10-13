// THE ASTROLOGY WHEEL (the Wildheart theme's signature, owner brief 2026-10-12: "A turning wheel of months,
// signs, seasons and moons sorts every festival, moon and gathering"). PURE, no React, no I/O. A port of the
// design handoff's astrology engine (components/calendar/astro.js): the sun's ecliptic longitude from a
// linear ephemeris, the moon's age from a known new moon, both approximations good to a day. Every date is
// read on its UTC parts, like mensworkSeason, so a wheel renders the same on every server.
//
// Three readers: the sky for one date (sky), the moons and festivals of a year (moonEvents, festivals), and
// the wheel model (astrologyWheel) that sorts a year's dated items into their month and sign for the three
// renderings in components/page-editor/blocks/wildheart.tsx (the scroll-through strip, the sky map, the
// date line). The season lines are the sign ingresses, so a season turns the day the sun enters Capricorn,
// Aries, Cancer or Libra.

import { MOON_PHASES, ZODIAC, type ZodiacId } from '@/lib/theme/wildheart-symbols'
import { WILDHEART_SEASONS, type WildheartSeason } from '@/lib/theme/wildheart'

export const DAY = 864e5
/** The mean synodic month in days, and a reference new moon (2000-01-06 18:14 UTC). */
const SYNODIC_MONTH = 29.530588853
const NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14)
const J2000 = Date.UTC(2000, 0, 1, 12)

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

const SIGN_SEASON: Record<ZodiacId, WildheartSeason> = {
  capricorn: 'winter', aquarius: 'winter', pisces: 'winter',
  aries: 'spring', taurus: 'spring', gemini: 'spring',
  cancer: 'summer', leo: 'summer', virgo: 'summer',
  libra: 'fall', scorpio: 'fall', sagittarius: 'fall',
}

/** A UTC date at midnight for a year, month (1 to 12) and day. */
export const utcDate = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))
/** The same date `n` days on. */
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY)
/** A YYYY-MM-DD key, read on UTC parts. */
export const isoDay = (d: Date) => d.toISOString().slice(0, 10)
/** A date from an ISO day or timestamp, read on its own digits (event times are wall-clock), or null. */
export function parseDay(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? utcDate(+m[1], +m[2], +m[3]) : null
}

/** The sun's apparent ecliptic longitude in degrees: the handoff's J2000 linear mean longitude, corrected by
 *  the equation of centre (the USNO low-precision formula, good to a hundredth of a degree), so the ingresses
 *  land on the days the handoff's own calendar names (Aries on Mar 20, not three days late). */
function sunLongitude(date: Date): number {
  const n = (date.getTime() - J2000) / DAY
  const mean = 280.46 + 0.9856474 * n
  const g = ((357.528 + 0.9856003 * n) * Math.PI) / 180
  const apparent = mean + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)
  return ((apparent % 360) + 360) % 360
}

/** The sign the sun is in on a date: read at the end of that UTC day, so the day the sun crosses into a
 *  sign counts as that sign whatever the hour (Aries on Mar 20, Scorpio on Oct 23), the way a calendar
 *  names it, and the reading does not move with the hour a page renders at. */
export function signOf(date: Date): ZodiacId {
  const end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59)
  return ZODIAC[Math.floor(sunLongitude(new Date(end)) / 30) % 12].id
}

/** The moon's age in days, read at the date's noon. */
function moonAge(date: Date): number {
  return ((((date.getTime() + 12 * 36e5) - NEW_MOON_EPOCH) / DAY) % SYNODIC_MONTH + SYNODIC_MONTH) % SYNODIC_MONTH
}

/** The moon's phase on a date, 0 (new) to 7 (balsamic), 4 being full. */
export function phaseOf(date: Date): number {
  return Math.round((moonAge(date) / SYNODIC_MONTH) * 8) % 8
}

/** The season a date falls in: the sign's season. */
export function seasonOf(date: Date): WildheartSeason {
  return SIGN_SEASON[signOf(date)]
}

/** The first and last day of the sign's run that contains `date`. */
function signRange(date: Date): [Date, Date] {
  const sign = signOf(date)
  let a = date
  let b = date
  while (signOf(addDays(a, -1)) === sign) a = addDays(a, -1)
  while (signOf(addDays(b, 1)) === sign) b = addDays(b, 1)
  return [a, b]
}

/** The wheel angle of a date in degrees, 0 at the winter solstice ingress (the top of the wheel). */
export function wheelAngle(date: Date): number {
  const end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59)
  return ((sunLongitude(new Date(end)) - 270) % 360 + 360) % 360
}

export interface Sky {
  date: Date
  sign: ZodiacId
  signName: string
  glyph: string
  house: string
  houseName: string
  season: WildheartSeason
  seasonName: string
  seasonTheme: string
  phase: number
  phaseName: string
  range: [Date, Date]
}

/** Everything the theme knows about one date. */
export function sky(date: Date = new Date()): Sky {
  const sign = signOf(date)
  const z = ZODIAC.find((s) => s.id === sign)!
  const season = SIGN_SEASON[sign]
  const phase = phaseOf(date)
  return {
    date,
    sign,
    signName: z.name,
    glyph: z.glyph,
    house: z.house,
    houseName: z.houseName,
    season,
    seasonName: WILDHEART_SEASONS[season].name,
    seasonTheme: WILDHEART_SEASONS[season].theme,
    phase,
    phaseName: MOON_PHASES[phase],
    range: signRange(date),
  }
}

/** The day-of-year angle of a date on a calendar wheel: 0 at Jan 1, a full turn by the next Jan 1. */
function dateAngle(date: Date, year: number): number {
  const start = Date.UTC(year, 0, 1)
  const days = (Date.UTC(year + 1, 0, 1) - start) / DAY
  return ((((date.getTime() - start) / DAY) % days + days) % days / days) * 360
}

type WheelItemKind = 'festival' | 'moon' | 'gathering' | 'event'

interface WheelItemInput {
  id: string
  /** An ISO day or timestamp. */
  date: string
  title: string
  kind: WheelItemKind
  note?: string | null
  href?: string | null
}

interface WheelItem extends WheelItemInput {
  day: Date
  angle: number
  month: number
  sign: ZodiacId
  season: WildheartSeason
  phase: number
}

interface WheelMonth {
  index: number
  name: string
  startAngle: number
  midAngle: number
  items: WheelItem[]
}

interface WheelSign {
  id: ZodiacId
  name: string
  glyph: string
  house: string
  houseName: string
  season: WildheartSeason
  /** The ingress day within the year (Capricorn's is the previous year's solstice). */
  start: Date
  end: Date
  startAngle: number
  midAngle: number
  items: WheelItem[]
}

interface WheelSeasonArc {
  id: WildheartSeason
  name: string
  theme: string
  startAngle: number
  endAngle: number
}

export interface WheelModel {
  year: number
  months: WheelMonth[]
  /** The twelve signs in the order the year walks them: Capricorn first. */
  signs: WheelSign[]
  seasons: WheelSeasonArc[]
  items: WheelItem[]
}

/** The sign ingresses of a year as dates: the day the sun enters each sign, Capricorn's from the previous
 *  December so the winter sign that opens the year has a start. */
export function ingresses(year: number): { id: ZodiacId; start: Date }[] {
  const out: { id: ZodiacId; start: Date }[] = []
  let prev = signOf(utcDate(year - 1, 12, 15))
  for (let d = utcDate(year - 1, 12, 15); d.getTime() < Date.UTC(year + 1, 0, 1); d = addDays(d, 1)) {
    const s = signOf(d)
    if (s !== prev) {
      out.push({ id: s, start: d })
      prev = s
    }
  }
  return out
}

/** The wheel model for a year: months, signs, season arcs, and every dated item sorted into its month and
 *  sign. Items outside the year are dropped; the rest sort by date, then by the order given. */
export function astrologyWheel(year: number, inputs: readonly WheelItemInput[]): WheelModel {
  const items: WheelItem[] = inputs
    .map((input, i) => ({ input, i, day: parseDay(input.date) }))
    .filter((x): x is { input: WheelItemInput; i: number; day: Date } => !!x.day && x.day.getUTCFullYear() === year)
    .sort((a, b) => a.day.getTime() - b.day.getTime() || a.i - b.i)
    .map(({ input, day }) => ({
      ...input,
      day,
      angle: dateAngle(day, year),
      month: day.getUTCMonth(),
      sign: signOf(day),
      season: seasonOf(day),
      phase: phaseOf(day),
    }))
  const months: WheelMonth[] = MONTHS.map((name, index) => ({
    index,
    name,
    startAngle: dateAngle(utcDate(year, index + 1, 1), year),
    midAngle: dateAngle(utcDate(year, index + 1, 15), year),
    items: items.filter((it) => it.month === index),
  }))
  const starts = ingresses(year)
  const signs: WheelSign[] = []
  for (let i = 0; i < starts.length; i++) {
    const z = ZODIAC.find((s) => s.id === starts[i].id)!
    // The same sign returns after a year (Capricorn in December): keep the first run only.
    if (signs.some((s) => s.id === z.id)) continue
    const next = starts[i + 1]?.start ?? utcDate(year + 1, 1, 1)
    const start = starts[i].start
    const end = addDays(next, -1)
    const a0 = start.getUTCFullYear() < year ? 0 : dateAngle(start, year)
    const a1 = next.getUTCFullYear() > year ? 360 : dateAngle(next, year)
    signs.push({
      id: z.id,
      name: z.name,
      glyph: z.glyph,
      house: z.house,
      houseName: z.houseName,
      season: SIGN_SEASON[z.id],
      start,
      end,
      startAngle: a0,
      midAngle: (a0 + a1) / 2,
      items: items.filter((it) => it.sign === z.id),
    })
  }
  const seasons: WheelSeasonArc[] = (['winter', 'spring', 'summer', 'fall'] as const).map((id) => {
    const run = signs.filter((s) => s.season === id)
    const first = run[0]
    const last = run[run.length - 1]
    const nextStart = signs.find((s) => s.start.getTime() > last.end.getTime())?.start
    return {
      id,
      name: WILDHEART_SEASONS[id].name,
      theme: WILDHEART_SEASONS[id].theme,
      startAngle: first.startAngle,
      endAngle: nextStart && nextStart.getUTCFullYear() === year ? dateAngle(nextStart, year) : 360,
    }
  })
  return { year, months, signs, seasons, items }
}

/** The full and new moons of a year, computed from the synodic month (good to a day). */
export function moonEvents(year: number): { day: Date; phase: 0 | 4; title: string }[] {
  const out: { day: Date; phase: 0 | 4; title: string }[] = []
  const half = SYNODIC_MONTH / 2
  let prev = moonAge(utcDate(year - 1, 12, 31))
  for (let d = utcDate(year, 1, 1); d.getUTCFullYear() === year; d = addDays(d, 1)) {
    const age = moonAge(d)
    if (age < prev) out.push({ day: d, phase: 0, title: 'New moon' })
    else if (prev < half && age >= half) out.push({ day: d, phase: 4, title: 'Full moon' })
    prev = age
  }
  return out
}

/** The traditional names of the twelve full moons, by calendar month. */
const FULL_MOON_NAMES = ['Wolf Moon', 'Snow Moon', 'Worm Moon', 'Pink Moon', 'Flower Moon', 'Strawberry Moon', 'Buck Moon', 'Sturgeon Moon', 'Harvest Moon', "Hunter's Moon", 'Beaver Moon', 'Cold Moon'] as const

/** The eight festivals of the Wheel of the Year on their fixed days, with a one-line reading each. */
export function festivals(year: number): { day: Date; title: string; note: string }[] {
  return [
    { day: utcDate(year, 2, 1), title: 'Imbolc', note: 'First stirrings under the frost' },
    { day: utcDate(year, 3, 20), title: 'Ostara', note: 'Spring equinox. Balance, then light wins' },
    { day: utcDate(year, 5, 1), title: 'Beltane', note: 'Fire festival. Pleasure, growth, dance' },
    { day: utcDate(year, 6, 21), title: 'Litha', note: 'Summer solstice. The sun at full height' },
    { day: utcDate(year, 8, 1), title: 'Lughnasadh', note: 'First harvest. Gratitude, bread' },
    { day: utcDate(year, 9, 22), title: 'Mabon', note: 'Fall equinox. Balance, letting go' },
    { day: utcDate(year, 10, 31), title: 'Samhain', note: 'The veil is thin. Honour what came before' },
    { day: utcDate(year, 12, 21), title: 'Yule', note: 'Winter solstice. The return of the light' },
  ]
}

/** The year's sky items the theme draws on its own: the festivals and the moons, as wheel inputs. */
export function skyItems(year: number): WheelItemInput[] {
  const fest: WheelItemInput[] = festivals(year).map((f) => ({ id: `festival-${isoDay(f.day)}`, date: isoDay(f.day), title: f.title, kind: 'festival', note: f.note }))
  const moons: WheelItemInput[] = moonEvents(year).map((m) => ({
    id: `moon-${isoDay(m.day)}`,
    date: isoDay(m.day),
    title: m.phase === 4 ? FULL_MOON_NAMES[m.day.getUTCMonth()] : 'New moon',
    kind: 'moon',
    note: m.phase === 4 ? 'Full moon. Release' : 'New moon. Set an intention',
  }))
  return [...fest, ...moons]
}

/** A Space's own events as wheel inputs, beside the sky's. Every event is a gathering; the title is the
 *  owner's. */
export function eventItems(events: readonly { id: string; title: string; startsAt: string; href?: string | null }[]): WheelItemInput[] {
  return events.map((e) => ({ id: `event-${e.id}`, date: e.startsAt, title: e.title, kind: 'gathering', href: e.href ?? null }))
}

/** "Oct 12" for a date. */
export function shortDay(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`
}
