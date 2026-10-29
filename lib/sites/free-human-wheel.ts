// THE FREE HUMAN YEAR WHEEL, THE SKY (design: templates/website/YearWheel.dc.html). PURE: no React, no Next, no clock. One year of
// the wheel: the sun's sign for every day, its ingresses, the four turns and four cross-quarter festivals, every full and new moon,
// the eclipses and Mercury's retrograde arcs, with the angle each one sits at. The sun and moon are computed (good to about a day,
// like ./free-human-sky.ts); eclipses and retrograde arcs are hand-entered tables, so the wheel covers only the years they hold.
// Dates are read at noon UTC so a day is the same day on the server and in the browser.

export const FREE_HUMAN_WHEEL_YEARS = [2026, 2027, 2028] as const

const DAY = 864e5
const SYN = 29.530588853
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14)

const SIGNS = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'] as const
type Sign = (typeof SIGNS)[number]

/** The sign's mark, text presentation so a phone does not turn it into an emoji. */
export const FREE_HUMAN_SIGN_GLYPH: Record<Sign, string> = { aries: '♈', taurus: '♉', gemini: '♊', cancer: '♋', leo: '♌', virgo: '♍', libra: '♎', scorpio: '♏', sagittarius: '♐', capricorn: '♑', aquarius: '♒', pisces: '♓' }
export const FREE_HUMAN_TEXT_MARK = '︎'

const INFO: Record<Sign, [string, string, string, string]> = {
  aries: ['Fire', 'Cardinal', 'Mars', 'Courage, fire and beginnings. The astrological year opens here.'],
  taurus: ['Earth', 'Fixed', 'Venus', 'The senses, the body, and what you keep close.'],
  gemini: ['Air', 'Mutable', 'Mercury', 'Curiosity, talk and quick connection.'],
  cancer: ['Water', 'Cardinal', 'the Moon', 'Home, kin, roots and tending.'],
  leo: ['Fire', 'Fixed', 'the Sun', 'Play, heart and being seen.'],
  virgo: ['Earth', 'Mutable', 'Mercury', 'Craft, ritual and the work of the hands.'],
  libra: ['Air', 'Cardinal', 'Venus', 'Balance, beauty and the ties between us.'],
  scorpio: ['Water', 'Fixed', 'Pluto', 'Depth, endings and what lies beneath.'],
  sagittarius: ['Fire', 'Mutable', 'Jupiter', 'Wandering, meaning and wide horizons.'],
  capricorn: ['Earth', 'Cardinal', 'Saturn', 'Patience, structure and the long climb.'],
  aquarius: ['Air', 'Fixed', 'Uranus', 'Kinship, vision and the strange new thing.'],
  pisces: ['Water', 'Mutable', 'Neptune', 'Dreams, tides and the last breath before the wheel turns.'],
}
const SOLAR: Partial<Record<Sign, [string, string, string]>> = {
  aries: ['Spring equinox', 'Ostara', 'Day and night stand equal. From here the light outgrows the dark.'],
  cancer: ['Summer solstice', 'Litha', 'The longest day. The sun stands at its height, then begins to wane.'],
  libra: ['Fall equinox', 'Mabon', 'Day and night balance once more. From here the dark grows.'],
  capricorn: ['Winter solstice', 'Yule', 'The longest night. From here the light returns, a little each day.'],
}
const CROSS: [number, number, string, string, string][] = [
  [2, 1, 'Imbolc', 'First stirrings of spring', 'Halfway from midwinter to the equinox. Life stirs under the frost.'],
  [5, 1, 'Beltane', 'The fire festival', 'Halfway to midsummer. Fires are lit for growth and pleasure.'],
  [8, 1, 'Lughnasadh', 'The first harvest', 'Halfway to the fall equinox. The first grain is cut.'],
  [10, 31, 'Samhain', 'The harvest ends, the veil thins', 'Halfway to midwinter. The old year ends and the dead are remembered.'],
]
export type FreeHumanSeasonId = 'winter' | 'spring' | 'summer' | 'fall'
const SEASON_OF: Record<Sign, FreeHumanSeasonId> = { capricorn: 'winter', aquarius: 'winter', pisces: 'winter', aries: 'spring', taurus: 'spring', gemini: 'spring', cancer: 'summer', leo: 'summer', virgo: 'summer', libra: 'fall', scorpio: 'fall', sagittarius: 'fall' }
export const FREE_HUMAN_SEASON_NAME: Record<FreeHumanSeasonId, string> = { winter: 'Winter', spring: 'Spring', summer: 'Summer', fall: 'Fall' }
export const FREE_HUMAN_MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const FREE_HUMAN_MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const PHASE = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent']
const MOON_NAMES = ['Wolf', 'Snow', 'Worm', 'Pink', 'Flower', 'Strawberry', 'Buck', 'Sturgeon', 'Harvest', "Hunter's", 'Beaver', 'Cold']
// [month, day, solar or lunar, kind], hand-entered
const ECLIPSES: Record<number, [number, number, 'solar' | 'lunar', string][]> = {
  2026: [[2, 17, 'solar', 'Annular'], [3, 3, 'lunar', 'Total'], [8, 12, 'solar', 'Total'], [8, 28, 'lunar', 'Partial']],
  2027: [[2, 6, 'solar', 'Annular'], [2, 20, 'lunar', 'Penumbral'], [7, 18, 'lunar', 'Penumbral'], [8, 2, 'solar', 'Total'], [8, 17, 'lunar', 'Penumbral']],
  2028: [[1, 12, 'lunar', 'Partial'], [1, 26, 'solar', 'Annular'], [7, 6, 'lunar', 'Partial'], [7, 22, 'solar', 'Total'], [12, 31, 'lunar', 'Total']],
}
// [from month, from day, to month, to day], hand-entered
const RETROGRADE: Record<number, [number, number, number, number][]> = {
  2026: [[2, 26, 3, 20], [6, 29, 7, 23], [10, 24, 11, 13]],
  2027: [[2, 9, 3, 3], [6, 10, 7, 4], [10, 7, 10, 28]],
  2028: [[1, 24, 2, 14], [5, 21, 6, 13], [9, 19, 10, 11]],
}

export type FreeHumanWheelKind = 'ingress' | 'season' | 'festival' | 'full' | 'new' | 'eclipse' | 'retro' | 'direct' | 'gathering' | 'month'
export interface FreeHumanWheelEvent {
  /** Day of the year, 0 for January 1. */
  i: number
  kind: FreeHumanWheelKind
  sign?: string
  title: string
  sub: string
  text: string
  label?: string
  href?: string
  date?: string
}
/** A gathering handed in by the block: "YYYY-MM-DD" plus its lines. */
export interface FreeHumanWheelGathering { date: string; title: string; sub?: string; text?: string; label?: string; href?: string }

/** Which layer switch each kind answers to, and how the legend names and marks it. */
export const FREE_HUMAN_WHEEL_LAYERS: readonly (readonly [string, string, FreeHumanWheelKind])[] = [
  ['sun', 'Signs', 'ingress'], ['seasons', 'Festivals', 'festival'], ['full', 'Full moons', 'full'], ['new', 'New moons', 'new'],
  ['eclipses', 'Eclipses', 'eclipse'], ['retro', 'Mercury retrograde', 'retro'], ['ours', 'Our gatherings', 'gathering'],
]
const LAYER_OF: Record<FreeHumanWheelKind, string> = { ingress: 'sun', season: 'seasons', festival: 'seasons', full: 'full', new: 'new', eclipse: 'eclipses', retro: 'retro', direct: 'retro', gathering: 'ours', month: 'sun' }
const PRIORITY: Record<FreeHumanWheelKind, number> = { gathering: -1, eclipse: 0, season: 1, festival: 2, ingress: 3, full: 4, retro: 5, direct: 5, new: 6, month: 7 }

interface FreeHumanWheelDay { y: number; m: number; d: number; sign: Sign; phase: number }
export interface FreeHumanWheelStop { i: number; items: FreeHumanWheelEvent[] }
export interface FreeHumanWheelYear {
  y: number
  n: number
  days: FreeHumanWheelDay[]
  /** Every event, before the layer filter. */
  ev: FreeHumanWheelEvent[]
  /** The sign arcs in degrees. */
  segs: { sign: Sign; a0: number; a1: number }[]
  seasons: [FreeHumanSeasonId, number, number][]
  /** The season and sign bands along the thread, as days. */
  tSeasons: [FreeHumanSeasonId, number, number][]
  tSigns: { sign: Sign; s: number; e: number }[]
  /** Mercury retrograde arcs, as [from day, to day]. */
  arcs: [number, number][]
  monthStart: number[]
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const noon = (y: number, i: number) => new Date(Date.UTC(y, 0, 1 + i, 12))

function sunLon(d: Date): number {
  const n = (d.getTime() - Date.UTC(2000, 0, 1, 12)) / DAY
  const L = 280.46 + 0.9856474 * n
  const g = ((357.528 + 0.9856003 * n) * Math.PI) / 180
  return (((L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) % 360) + 360) % 360
}
const signOf = (d: Date): Sign => SIGNS[Math.floor(sunLon(d) / 30)]
const moonAge = (d: Date) => ((((d.getTime() - NEW_MOON) / DAY) % SYN) + SYN) % SYN
const phaseOf = (d: Date) => Math.round((moonAge(d) / SYN) * 8) % 8

/** "Mar 3". */
export const freeHumanWheelDate = (y: number, i: number) => {
  const d = noon(y, i)
  return `${FREE_HUMAN_MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`
}
export const freeHumanWheelMonthDay = (day: FreeHumanWheelDay) => `${FREE_HUMAN_MONTH_LONG[day.m]} ${day.d}`
const ordinal = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] || 'th')

/** The small label over a stop's title. */
export function freeHumanWheelKindLabel(e: FreeHumanWheelEvent): string {
  if (e.kind === 'gathering') return e.label || 'Gathering'
  if (e.kind === 'season') return e.title.includes('equinox') ? 'Equinox' : 'Solstice'
  return ({ ingress: 'Sun sign', month: 'Month', festival: 'Festival', full: 'Full moon', new: 'New moon', eclipse: 'Eclipse', retro: 'Mercury', direct: 'Mercury' } as Record<string, string>)[e.kind]
}

/** "Sun in Scorpio · Fall · waning gibbous". */
export function freeHumanWheelContext(day: FreeHumanWheelDay): string {
  return `Sun in ${cap(day.sign)} · ${FREE_HUMAN_SEASON_NAME[SEASON_OF[day.sign]]} · ${PHASE[day.phase].toLowerCase()}`
}
export const freeHumanWheelPhaseName = (phase: number) => PHASE[phase]
export const freeHumanWheelSeasonOf = (sign: string) => SEASON_OF[sign as Sign]
export const freeHumanWheelCap = cap

/** One year of the wheel. */
export function freeHumanWheelYear(y: number): FreeHumanWheelYear {
  const n = new Date(Date.UTC(y, 1, 29)).getUTCMonth() === 1 ? 366 : 365
  const doy = (m: number, d: number) => Math.round((Date.UTC(y, m - 1, d, 12) - noon(y, 0).getTime()) / DAY)
  const days: FreeHumanWheelDay[] = []
  for (let i = 0; i < n; i++) {
    const d = noon(y, i)
    days.push({ y, m: d.getUTCMonth(), d: d.getUTCDate(), sign: signOf(d), phase: phaseOf(d) })
  }
  const ev: FreeHumanWheelEvent[] = []
  const ingress: { i: number; sign: Sign }[] = []
  let pv = signOf(noon(y, -1))
  days.forEach((x, i) => { if (x.sign !== pv) { ingress.push({ i, sign: x.sign }); pv = x.sign } })
  ingress.forEach((g) => {
    const I = INFO[g.sign]
    ev.push({ i: g.i, kind: 'ingress', sign: g.sign, title: `The sun enters ${cap(g.sign)}`, sub: `${I[0]} · ${I[1]} · ruled by ${I[2]}`, text: I[3] })
    const S = SOLAR[g.sign]
    if (S) ev.push({ i: g.i, kind: 'season', title: S[0], sub: `${S[1]} · the sun enters ${cap(g.sign)}`, text: S[2] })
  })
  CROSS.forEach(([m, d, t, sub, text]) => ev.push({ i: doy(m, d), kind: 'festival', title: t, sub, text }))

  const ages: number[] = []
  for (let i = -1; i <= n; i++) ages.push(moonAge(noon(y, i)))
  const H = SYN / 2
  const moons: { i: number; full: boolean; name?: string }[] = []
  for (let j = 0; j < ages.length - 1; j++) {
    const a = ages[j]
    const b = ages[j + 1]
    const i = j - 1
    if (a < H && b >= H) { const k = H - a <= b - H ? i : i + 1; if (k >= 0 && k < n) moons.push({ i: k, full: true }) }
    if (b < a) { const k = SYN - a <= b ? i : i + 1; if (k >= 0 && k < n) moons.push({ i: k, full: false }) }
  }
  const perMonth: Record<number, number> = {}
  moons.forEach((m) => {
    if (!m.full) return
    const mo = days[m.i].m
    perMonth[mo] = (perMonth[mo] || 0) + 1
    m.name = perMonth[mo] > 1 ? 'Blue Moon' : `${MOON_NAMES[mo]} Moon`
  })
  const opp = (s: Sign) => SIGNS[(SIGNS.indexOf(s) + 6) % 12]
  ;(ECLIPSES[y] || []).forEach(([m, d, type, kind]) => {
    const i = doy(m, d)
    const lunar = type === 'lunar'
    const j = moons.findIndex((x) => x.full === lunar && Math.abs(x.i - i) <= 2)
    const name = j >= 0 ? moons[j].name : ''
    if (j >= 0) moons.splice(j, 1)
    const ms = lunar ? opp(days[i].sign) : days[i].sign
    ev.push({
      i, kind: 'eclipse', title: `${kind} ${lunar ? 'lunar' : 'solar'} eclipse`, sub: `${lunar ? 'Full' : 'New'} moon in ${cap(ms)}${name ? ` · ${name}` : ''}`,
      text: lunar ? "The full moon passes through the earth's shadow and may burn red. A turning point." : 'The new moon crosses the face of the sun. A turning point.',
    })
  })
  moons.forEach((m) => ev.push(m.full
    ? { i: m.i, kind: 'full', title: `Full moon in ${cap(opp(days[m.i].sign))}`, sub: m.name ?? '', text: 'The moon stands opposite the sun, fully lit. A time to finish and release.' }
    : { i: m.i, kind: 'new', title: `New moon in ${cap(days[m.i].sign)}`, sub: 'Moon and sun together', text: 'The moon goes dark beside the sun. A time to begin and set intentions.' }))
  const arcs: [number, number][] = []
  ;(RETROGRADE[y] || []).forEach(([m0, d0, m1, d1]) => {
    const s = doy(m0, d0)
    const e = doy(m1, d1)
    arcs.push([s, e])
    ev.push({ i: s, kind: 'retro', title: 'Mercury turns retrograde', sub: `Until ${freeHumanWheelDate(y, e)}`, text: 'Mercury appears to walk backwards for three weeks. Review and revisit rather than begin.' })
    ev.push({ i: e, kind: 'direct', title: 'Mercury turns direct', sub: `Retrograde since ${freeHumanWheelDate(y, s)}`, text: 'Mercury moves forward again. What was held can move.' })
  })

  const A = (i: number) => (i / n) * 360
  const segs = ingress.map((g, k) => ({ sign: g.sign, a0: A(g.i), a1: k + 1 < ingress.length ? A(ingress[k + 1].i) : 360 }))
  if (ingress.length && ingress[0].i > 0) {
    const s0 = days[0].sign
    const last = segs[segs.length - 1]
    if (last && last.sign === s0) last.a1 = 360 + A(ingress[0].i)
    else segs.unshift({ sign: s0, a0: 0, a1: A(ingress[0].i) })
  }
  const di = (s: Sign) => ingress.find((x) => x.sign === s)?.i ?? 0
  const seasons: FreeHumanWheelYear['seasons'] = [['spring', A(di('aries')), A(di('cancer'))], ['summer', A(di('cancer')), A(di('libra'))], ['fall', A(di('libra')), A(di('capricorn'))], ['winter', A(di('capricorn')), 360 + A(di('aries'))]]
  const tSeasons: FreeHumanWheelYear['tSeasons'] = [['winter', 0, di('aries')], ['spring', di('aries'), di('cancer')], ['summer', di('cancer'), di('libra')], ['fall', di('libra'), di('capricorn')], ['winter', di('capricorn'), n]]
  const tSigns: FreeHumanWheelYear['tSigns'] = []
  let cs = days[0].sign
  let cst = 0
  ingress.forEach((g) => { if (g.i > cst) tSigns.push({ sign: cs, s: cst, e: g.i }); cs = g.sign; cst = g.i })
  tSigns.push({ sign: cs, s: cst, e: n })
  return { y, n, days, ev, segs, seasons, tSeasons, tSigns, arcs, monthStart: FREE_HUMAN_MONTH_SHORT.map((_, m) => doy(m + 1, 1)) }
}

/** The year with the Space's gatherings added and the layer filter applied: the events that show and the stops the wheel visits. */
export function freeHumanWheelStops(Y: FreeHumanWheelYear, gatherings: readonly FreeHumanWheelGathering[], filters: Record<string, boolean>) {
  const base = noon(Y.y, 0).getTime()
  const ours: FreeHumanWheelEvent[] = gatherings
    .filter((g) => g && g.date && Number(g.date.slice(0, 4)) === Y.y)
    .map((g) => {
      const [yy, mm, dd] = g.date.split('-').map(Number)
      return { i: Math.round((Date.UTC(yy, mm - 1, dd, 12) - base) / DAY), kind: 'gathering' as const, title: g.title, sub: g.sub || '', text: g.text || '', label: g.label || 'Gathering', href: g.href || '', date: g.date }
    })
  const evs = [...Y.ev, ...ours].filter((e) => filters[LAYER_OF[e.kind]])
  const by: Record<number, FreeHumanWheelEvent[]> = {}
  evs.forEach((e) => { (by[e.i] = by[e.i] || []).push(e) })
  const stops: FreeHumanWheelStop[] = Object.keys(by).map(Number).sort((a, b) => a - b).map((i) => ({ i, items: by[i].sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind]) }))
  return { evs, stops, all: [...Y.ev, ...ours] }
}

/** A month as a stop of its own: the sign or signs the sun moves through, and what the month holds. */
export function freeHumanWheelMonth(Y: FreeHumanWheelYear, evs: readonly FreeHumanWheelEvent[], m: number): FreeHumanWheelEvent {
  const i = Y.monthStart[m]
  const end = m < 11 ? Y.monthStart[m + 1] : Y.n
  const signs: string[] = []
  for (let j = i; j < end; j++) { const g = Y.days[j].sign; if (!signs.includes(g)) signs.push(g) }
  const inMonth = evs.filter((x) => x.i >= i && x.i < end && x.kind !== 'ingress').sort((a, b) => a.i - b.i)
  const text = inMonth.length ? `${inMonth.slice(0, 5).map((x) => `${x.title} on the ${Y.days[x.i].d}${ordinal(Y.days[x.i].d)}`).join('. ')}.` : 'A quiet month in the sky.'
  return { i, kind: 'month', title: FREE_HUMAN_MONTH_LONG[m], sub: `Sun in ${signs.map(cap).join(', then ')}`, text }
}
