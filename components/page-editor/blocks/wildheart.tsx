import type { ComponentConfig } from '@/lib/page-editor/types'
import { layoutField, layoutDefault, padClass, visClass, type LayoutValue } from '@/lib/page-editor/layout'
import { imgField } from '@/lib/page-editor/fields'
import {
  addDays,
  astrologyWheel,
  eventItems,
  festivals,
  isoDay,
  parseDay,
  shortDay,
  signOf,
  sky,
  skyItems,
  utcDate,
  type WheelModel,
} from '@/lib/theme/astrology-wheel'
import { ZODIAC } from '@/lib/theme/wildheart-symbols'
import { safeImageSrc } from '@/lib/safe-image-src'
import { slugify } from '@/lib/utils'
import { safeImageUrl } from '@/lib/entity-blocks/block-content'
import { siteLocalHref, type SiteLinkMap } from '@/lib/sites/house-theme'
import { dateLabel } from '@/lib/sites/menswork-page'
import { WildheartNowLine } from '@/components/sites/wildheart-now-line'
import { WhConstellation, WhGlyph, WhLogoMark, WhMoon, WhMoonPhases, WhOrnament, WhSeal } from '@/components/sites/wildheart-symbols'
import { WildheartYearJourney, type YearGeometry, type YearJourneyData, type YearStop } from '@/components/sites/wildheart-year-journey'
import { WildheartSkyMap, type SkyGroup, type SkyMapData, type SkyMapEvent } from '@/components/sites/wildheart-sky-map'
import { WildheartFirstNight } from '@/components/sites/wildheart-first-night'
import { InlineText } from '@/components/sites/inline-text'

// ── The Wildheart block family (owner brief 2026-10-12; LIVE-903 and LIVE-904, the design handoff) ─────
// Every section of the handoff's six screens that no generic block can carry is one registered block
// here, drawn from ONE model (lib/theme/astrology-wheel.ts, pure) where it reads the sky, and from the
// Space's own events (`puck.metadata.space.events`, the channel the Space blocks read) where it reads
// dates. Server Components, except the two signature pieces the handoff makes interactive: the pinned,
// scroll-scrubbed YearJourney and the click-driven SkyMap, which hand serialised data to client islands
// loaded only on a Wildheart page (components/sites/wildheart-year-journey.tsx, wildheart-sky-map.tsx),
// and the four-way first-night choice (wildheart-first-night.tsx).
//
// Every default word here is the THEME's, generic and gender-neutral (owner ruling 2026-10-12: Wildheart
// is a stock theme in the Frequency library). A Space's own rows carry its own titles. The blocks read
// `--wh-*` tokens only; outside a Wildheart site they render in the page's own faces and colours.

type SpaceEvent = { id: string; slug?: string; title: string; startsAt: string; endsAt?: string | null; description?: string | null; href?: string | null }

/** The year a block draws: the owner's, or the current one (0 and blanks mean "this year"). */
function wheelYear(value: unknown, now: Date): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(n) && n >= 1970 && n <= 2200 ? n : now.getUTCFullYear()
}

function spaceEvents(metadata: Record<string, unknown> | undefined): SpaceEvent[] {
  const space = metadata?.space as { events?: unknown } | undefined
  const events = Array.isArray(space?.events) ? (space!.events as SpaceEvent[]) : []
  return events.filter((e) => e && typeof e.id === 'string' && typeof e.title === 'string' && typeof e.startsAt === 'string')
}

/** The first line of an event's description, as its note. */
const noteOf = (e: SpaceEvent): string => (typeof e.description === 'string' ? e.description.split('\n')[0].trim() : '')
/** "Tue · 6:00 PM" for an event with a time of day, else nothing. */
const whenOf = (e: SpaceEvent): string => {
  const { day, time } = dateLabel(e.startsAt)
  return time ? `${day.slice(0, 3)} · ${time}` : ''
}
/** A title as a comparison key: the shared slug rule (lib/utils.ts slugify, the one copy) with spaces. */
const norm = (s: string) => slugify(s).replace(/-/g, ' ')

/** The sky's own items beside the Space's events, the Space's winning where both name the same day (a
 *  Space that lists its festivals and moons as events shows them once, with their links). */
function model(year: number, metadata: Record<string, unknown> | undefined): WheelModel {
  const events = spaceEvents(metadata)
  // The Space's own rows read the way the handoff's calendar does: the weekday and time when the event
  // has one ("Tue · 6:00 PM"), then the description's first line.
  const own = eventItems(events.map((e) => ({ ...e, href: e.href ?? null }))).map((it, i) => ({ ...it, note: [whenOf(events[i]), noteOf(events[i])].filter(Boolean).join(' · ') }))
  const noteBy = new Map(events.map((e) => [`event-${e.id}`, noteOf(e)]))
  const key = (date: string, title: string) => `${date.slice(0, 10)}:${norm(title)}`
  const byKey = new Map(own.map((e) => [key(e.date, e.title), e]))
  const merged = new Set<string>()
  // A sky item the Space also lists (a festival, a moon) keeps its kind and phase and takes the Space's
  // title, note and link; the Space's row is then not listed twice.
  const skies = skyItems(year).map((s) => {
    const hit = byKey.get(key(s.date, s.title)) ?? byKey.get(key(s.date, s.title.replace(/ moon$/i, '')))
    if (!hit) return s
    merged.add(hit.id)
    return { ...s, id: hit.id, title: hit.title, note: noteBy.get(hit.id) || s.note, href: hit.href ?? null }
  })
  return astrologyWheel(year, [...skies, ...own.filter((e) => !merged.has(e.id))])
}

function Head({ heading, lead, label, centred }: { heading?: string; lead?: string; label?: string; centred?: boolean }) {
  if (!heading && !lead && !label) return null
  return (
    <div className={cls('wh-block-head', centred ? 'wh-block-head-centred' : undefined)}>
      {label && <span className="wh-label wh-label-ink">{label}</span>}
      {heading && <h2><InlineText text={heading} accentStars /></h2>}
      {lead && <p>{lead}</p>}
    </div>
  )
}

type Props = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || d)
const arr = (v: unknown): Props[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Props[]) : [])
const img = (v: unknown) => safeImageSrc(safeImageUrl(v) || null)
const cls = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' ')

/** The link map a website page hands every block through `puck.metadata.links` (components/sites/
 *  website-document.tsx); without one (the editor canvas, the Space page) a link is kept as written. */
function hrefOf(raw: string, metadata: Record<string, unknown> | undefined): string | null {
  if (!raw) return null
  const links = metadata?.links as SiteLinkMap | undefined
  return links ? (siteLocalHref(raw, links)?.href ?? null) : raw
}

const HOUSES = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
const ROMAN = (i: number) => HOUSES[i] ?? String(i + 1)

// ─────────────────────────────────────────────────────────────────────────────
// 1. The year journey: the pinned, scroll-scrubbed wheel (the handoff's YearJourney). The block reads
//    the sky of the year and the Space's events, curates the stops (the year opens, the first ingress,
//    the eight festivals, the first full moon, the program's own dates matched from the events) with
//    the theme's teaching lines, and hands the island its data.
// ─────────────────────────────────────────────────────────────────────────────

/** The theme's teaching line for each festival and for the stops the sky makes on its own. */
const TEACH: Record<string, string> = {
  Samhain: 'A cross-quarter day, halfway between the fall equinox and the winter solstice. The old year ends here.',
  Yule: 'The winter solstice: the longest night. From here the light returns, a minute a day.',
  Imbolc: 'A cross-quarter day: the first stirring of spring under the frost.',
  Ostara: 'The spring equinox: day and night in balance, then light wins.',
  Beltane: 'A cross-quarter day: the fire festival halfway to midsummer.',
  Litha: 'The summer solstice: the longest day, the sun at full height.',
  Lughnasadh: 'A cross-quarter day: the first harvest.',
  Mabon: 'The fall equinox: balance again, then the dark grows.',
}
const TEACH_OPEN = 'Read the needle from the outside in: the calendar date, the sign the sun is passing through, the season, and the moon at the centre. Scroll, or take the wheel and turn it.'
const TEACH_INGRESS = 'Signs don\'t line up with months. Each begins around the 20th to 23rd, when the sun crosses into the next twelfth of the sky. Each sign is one module.'
const TEACH_MOON = 'Full moon: the moon sits opposite the sun, fully lit. It comes about every 29½ days, so it drifts through the calendar.'

const dayAngle = (d: Date, year: number) => (Math.round((d.getTime() - Date.UTC(year, 0, 1)) / 864e5) / 365) * 360

interface ProgramStop {
  match: string
  title: string
  note: string
  teach: string
  /** Pick the first match after the last day of the stop named here (Circle Nights after the course). */
  after?: string
}

function yearJourneyData(year: number, metadata: Record<string, unknown> | undefined, programStops: ProgramStop[], modules: Record<string, { title: string; theme: string }>, links: { enroll: string | null; year: string | null }, labels: YearJourneyData['labels'], maxStops = 14): { data: YearJourneyData; startIso: string } {
  const start = utcDate(year, 1, 1)
  const end = utcDate(year, 12, 31)
  const wheel = model(year, metadata)
  const inWindow = wheel.items
  const stops: YearStop[] = []
  const dayOf = (d: Date) => Math.round((d.getTime() - start.getTime()) / 864e5)
  const k0 = sky(start)
  stops.push({ iso: isoDay(start), day: 0, kind: 'today', title: 'The year opens', note: `${k0.seasonName} · ${k0.seasonTheme} · the sun in ${k0.signName}`, teach: TEACH_OPEN, phase: k0.phase, passing: [] })
  for (let i = 1; i <= dayOf(end); i++) {
    const d = addDays(start, i)
    const sg = signOf(d)
    if (sg !== signOf(addDays(d, -1))) {
      const z = ZODIAC.find((s) => s.id === sg)!
      stops.push({ iso: isoDay(d), day: i, kind: 'ingress', title: `The sun enters ${z.name}`, note: `House ${z.house} · ${modules[sg]?.title ?? z.houseName}`, teach: TEACH_INGRESS, sign: sg, passing: [] })
      break
    }
  }
  for (const f of inWindow.filter((it) => it.kind === 'festival')) stops.push({ iso: isoDay(f.day), day: dayOf(f.day), kind: 'festival', title: f.title, note: f.note ?? '', teach: TEACH[f.title] ?? '', passing: [] })
  const fm = inWindow.find((it) => it.kind === 'moon' && it.phase === 4)
  if (fm) stops.push({ iso: isoDay(fm.day), day: dayOf(fm.day), kind: 'moon', title: fm.title, note: 'Full moon · release', teach: TEACH_MOON, phase: 4, passing: [] })
  const events = spaceEvents(metadata)
    .map((e) => ({ e, d: parseDay(e.startsAt) }))
    .filter((x): x is { e: SpaceEvent; d: Date } => !!x.d && x.d.getUTCFullYear() === year)
    .sort((a, b) => a.d.getTime() - b.d.getTime())
  const lastOf = (match: string) => events.filter((x) => new RegExp(match, 'i').test(x.e.title)).at(-1)?.d ?? null
  for (const ps of programStops) {
    if (!ps.match) continue
    const re = new RegExp(ps.match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    const floor = ps.after ? lastOf(ps.after.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : null
    const hit = events.find((x) => re.test(x.e.title) && (!floor || x.d.getTime() > floor.getTime()))
    if (!hit) continue
    stops.push({ iso: isoDay(hit.d), day: dayOf(hit.d), kind: 'program', title: ps.title || hit.e.title, note: ps.note || noteOf(hit.e), teach: ps.teach, passing: [] })
  }
  stops.sort((a, b) => a.day - b.day)
  const merged: YearStop[] = []
  for (const s of stops) if (!merged.some((m) => Math.abs(m.day - s.day) < 1)) merged.push(s)
  const st = merged.slice(0, maxStops)
  st.forEach((x, k) => {
    const nx = st[k + 1]
    x.passing = nx
      ? inWindow
          .filter((it) => it.kind !== 'festival' && dayOf(it.day) > x.day && dayOf(it.day) < nx.day)
          .slice(0, 4)
          .map((it) => ({ label: shortDay(it.day), title: it.title }))
      : []
  })
  const span = st.length ? st[st.length - 1].day : 0
  const table: YearJourneyData['table'] = []
  for (let i = 0; i <= span; i++) {
    const s = sky(addDays(start, i))
    table.push({ date: shortDay(s.date), sign: s.sign, signName: s.signName, house: s.house, season: s.season, seasonName: s.seasonName, phase: s.phase, phaseName: s.phaseName })
  }
  const geo: YearGeometry = {
    months: wheel.months.map((m) => ({ name: m.name, a: m.startAngle, mid: m.midAngle, iso: isoDay(utcDate(year, m.index + 1, 15)) })),
    signs: wheel.signs
      .filter((z) => z.start.getUTCFullYear() === year)
      .map((z) => ({ id: z.id, name: z.name, house: z.house, a: z.startAngle, a1: z.startAngle + (addDays(z.end, 1).getTime() - z.start.getTime()) / 864e5 / 365 * 360, mid: z.midAngle, iso: isoDay(addDays(z.start, 2)) })),
    seasons: wheel.seasons.map((s) => ({ id: s.id, a0: s.startAngle, a1: s.endAngle })),
    fests: inWindow.filter((it) => it.kind === 'festival').map((f) => ({ title: f.title, a: f.angle, iso: isoDay(f.day) })),
    dots: inWindow
      .filter((it) => it.kind !== 'festival' && !(it.kind === 'moon' && it.phase === 0))
      .map((it) => ({ kind: it.kind === 'moon' ? ('moon' as const) : /retreat/i.test(it.title) ? ('retreat' as const) : /circle night/i.test(it.title) ? ('circle' as const) : /week \d/i.test(it.title) ? ('foundation' as const) : ('gathering' as const), a: it.angle, title: `${it.title} · ${shortDay(it.day)}` })),
  }
  // The Capricorn arc that opens the year starts the previous December: give it its own wedge from the top.
  const cap = wheel.signs.find((z) => z.id === 'capricorn')
  if (cap && !geo.signs.some((s) => s.id === 'capricorn')) geo.signs.push({ id: 'capricorn', name: cap.name, house: cap.house, a: dayAngle(cap.start, year) - 360, a1: dayAngle(addDays(cap.end, 1), year), mid: cap.midAngle, iso: isoDay(start) })
  return { data: { a0: 0, span, stops: st, geo, table, labels, enrollHref: links.enroll, yearHref: links.year }, startIso: isoDay(start) }
}

const YJ_LABELS: YearJourneyData['labels'] = { calendar: 'Calendar', sky: 'Sky', season: 'Season', moon: 'Moon', skip: 'Skip the year ↓', tip: 'Scroll, or spin the wheel', save: 'Save my place', year: 'See the whole year on the sky map →', aria: 'The turning year. Use arrow keys to move between stops.' }

export function WildheartYearJourneyBlock({ year, label, heading, lead, programStops = [], modules = [], enrollHref, yearHref, now = new Date(), metadata, pad, vis }: {
  year?: number; label?: string; heading?: string; lead?: string; programStops?: Props[]; modules?: Props[]; enrollHref?: string; yearHref?: string; now?: Date
  metadata?: Record<string, unknown>; pad?: string; vis?: string
}) {
  const y = wheelYear(year, now)
  const mods = Object.fromEntries(modules.map((m) => [str(m.sign).toLowerCase(), { title: str(m.title), theme: str(m.theme) }]).filter(([k, v]) => k && (v as { title: string }).title))
  const stops: ProgramStop[] = programStops.map((p) => ({ match: str(p.match), title: str(p.title), note: str(p.note), teach: str(p.teach), after: str(p.after) || undefined }))
  const { data, startIso } = yearJourneyData(y, metadata, stops, mods, { enroll: hrefOf(str(enrollHref), metadata), year: hrefOf(str(yearHref), metadata) }, YJ_LABELS)
  return (
    <section className={cls('wh-block wh-block-journey', pad, vis)} data-season={sky(now).season}>
      <Head label={label} heading={heading} lead={lead} centred />
      <WildheartYearJourney data={data} startIso={startIso} />
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. The sky map: the click-driven wheel (the handoff's SkyMap), centered on a year page or compact on a
//    phone. The block sorts the sky's festivals and moons and the Space's events into one list and hands
//    the island its data.
// ─────────────────────────────────────────────────────────────────────────────

const SM_LABELS: SkyMapData['labels'] = {
  groups: { sabbat: 'Festivals', moon: 'Moons', circle: 'Circle Nights', gathering: 'Gatherings' },
  scopes: { sign: 'In this sign', season: 'This season', year: 'All year' },
  prev: 'Prev sign',
  next: 'Next sign',
  spin: 'Spin the year',
  pause: 'Pause',
  today: 'Today',
  tap: 'Tap any sign to travel there.',
  empty: 'Nothing here. Try this season or all year.',
  comingUp: 'Coming up',
  date: 'Date',
}

function skyMapEvents(year: number, metadata: Record<string, unknown> | undefined, now: Date, compact: boolean): SkyMapEvent[] {
  // A year page reads the whole year; a phone's compact map reads from the quarter before today, a year on.
  const years = compact ? [now.getUTCFullYear(), now.getUTCFullYear() + 1] : [year - 1, year]
  const items = years.flatMap((y) => model(y, metadata).items)
  return items.map((it) => {
    const circle = /circle night|week \d/i.test(it.title)
    const group: SkyGroup = it.kind === 'festival' ? 'sabbat' : it.kind === 'moon' ? 'moon' : circle ? 'circle' : 'gathering'
    return { iso: isoDay(it.day), title: it.title, note: it.note ?? '', group, phase: it.kind === 'moon' ? it.phase : undefined, href: it.href ?? null }
  })
}

export function WildheartSkyMapBlock({ year, label, heading, lead, layout = 'centered', modules = [], now = new Date(), metadata, pad, vis }: {
  year?: number; label?: string; heading?: string; lead?: string; layout?: string; modules?: Props[]; now?: Date
  metadata?: Record<string, unknown>; pad?: string; vis?: string
}) {
  const y = wheelYear(year, now)
  const compact = layout === 'compact'
  const todayIso = compact ? isoDay(now) : now.getUTCFullYear() === y ? isoDay(now) : isoDay(utcDate(y, 1, 1))
  const start = compact ? isoDay(utcDate(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) : isoDay(utcDate(y - 1, 10, 1))
  const end = compact ? isoDay(utcDate(now.getUTCFullYear() + 1, 12, 31)) : isoDay(utcDate(y, 12, 31))
  const data: SkyMapData = {
    startIso: start,
    endIso: end,
    todayIso,
    events: skyMapEvents(y, metadata, now, compact).filter((e) => e.iso >= start && e.iso <= end),
    modules: Object.fromEntries(modules.map((m) => [str(m.sign).toLowerCase(), { title: str(m.title), theme: str(m.theme) }]).filter(([k, v]) => k && (v as { title: string }).title)),
    labels: SM_LABELS,
  }
  const s = sky(parseDay(todayIso) ?? now)
  return (
    <section className={cls('wh-block wh-block-skymap', compact ? 'wh-block-skymap-compact' : undefined, pad, vis)} data-season={s.season}>
      <Head label={label} heading={heading} lead={lead} centred={compact} />
      <WildheartSkyMap data={data} layout={compact ? 'compact' : 'centered'} wheelSize={compact ? 340 : 440} />
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. The date line, placed inside a page.
// ─────────────────────────────────────────────────────────────────────────────

export function WildheartNowLineBlock({ now = new Date(), pad, vis }: { now?: Date; pad?: string; vis?: string }) {
  return (
    <section className={`wh-block wh-block-nowline ${pad ?? ''} ${vis ?? ''}`.trim()} data-season={sky(now).season}>
      <WildheartNowLine date={now} />
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. The composition pieces: the pieces of the handoff's six screens no generic block can carry. Each is
//    one section, theme-blind outside a Wildheart site. Every default is the THEME's.
// ─────────────────────────────────────────────────────────────────────────────

function Title({ text, accent, as: El = 'h2', className }: { text: string; accent?: string; as?: 'h1' | 'h2' | 'h3'; className?: string }) {
  if (!text) return null
  return (
    <El className={cls('wh-title', className)}>
      <InlineText text={text} accentStars accentWord={accent ?? ''} />
    </El>
  )
}

function Buttons({ primary, primaryHref, secondary, secondaryHref, secondaryKind = 'soft', metadata }: { primary?: string; primaryHref?: string; secondary?: string; secondaryHref?: string; secondaryKind?: 'soft' | 'ghost' | 'secondary'; metadata?: Record<string, unknown> }) {
  const a = primary && hrefOf(primaryHref ?? '', metadata)
  const b = secondary && hrefOf(secondaryHref ?? '', metadata)
  if (!a && !b) return null
  return (
    <div className="wh-actions">
      {a && <a className="hs-btn hs-btn-primary" href={a}>{primary}</a>}
      {b && <a className={`hs-btn hs-btn-${secondaryKind}`} href={b}>{secondary}</a>}
    </div>
  )
}

const GLYPH_OPTIONS = [...ZODIAC.map((z) => ({ label: z.name, value: z.id })), ...['fire', 'water', 'air', 'earth', 'quintessence', 'sun', 'moon', 'star', 'spark', 'venus'].map((id) => ({ label: id[0].toUpperCase() + id.slice(1), value: id }))]
const glyphField = { type: 'select', label: 'Glyph', options: GLYPH_OPTIONS } as const

// 4a. The ornament: a separator with a mark, or the "enter the year" bridge.
export function WildheartOrnamentBlock({ variant = 'moons', label, pad, vis }: { variant?: string; label?: string; pad?: string; vis?: string }) {
  const v = (['moons', 'star', 'phases', 'bridge'] as const).find((x) => x === variant) ?? 'moons'
  return (
    <div className={cls('wh-block wh-block-ornament', v === 'bridge' ? 'wh-block-bridge' : undefined, pad, vis)}>
      <WhOrnament variant={v} label={label} />
    </div>
  )
}

// 4b. The photo frame: an arch, petal, circle or rect crop with the warm or dusk grade, grain and an
//     optional veil, caption, credit and a watermark glyph behind one corner.
export function WildheartPhotoBlock({ image, alt, shape = 'arch', grade = 'warm', height = 420, caption, credit, watermark, pad, vis }: {
  image?: unknown; alt?: string; shape?: string; grade?: string; height?: number; caption?: string; credit?: string; watermark?: string; pad?: string; vis?: string
}) {
  const src = img(image)
  if (!src) return null
  return (
    <div className={cls('wh-block wh-block-photo', pad, vis)} style={{ position: 'relative', overflow: 'hidden' }}>
      <figure className="wh-frame" data-shape={shape} data-grade={grade} style={{ height: Math.max(160, Math.min(720, height)) }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host */}
        <img src={src} alt={alt ?? ''} loading="lazy" />
        <span className="wh-frame-grade" aria-hidden="true" />
        {caption && <figcaption className="wh-frame-caption">{caption}</figcaption>}
        {credit && <span className="wh-frame-credit">{credit}</span>}
      </figure>
      {watermark && <WhGlyph name={watermark} size={280} watermark />}
    </div>
  )
}

/** The moon phase for step `i` of `n`: waxing from new (0) a phase a step to full (4), then full. */
export const stepPhase = (i: number, n: number) => (n <= 1 ? 4 : Math.min(4, Math.round((i * 4) / Math.min(n - 1, 4))))

// 4c. The moon path: the steps of a path as a moon waxing from new to full, on one hairline, each step
//     numbered in roman.
export function WildheartMoonPathBlock({ label, heading, accentWord, note, steps, metadata, pad, vis }: {
  label?: string; heading?: string; accentWord?: string; note?: string; steps: Props[]; metadata?: Record<string, unknown>; pad?: string; vis?: string
}) {
  const items = steps.map((s) => ({ title: str(s.title), body: str(s.body), href: hrefOf(str(s.href), metadata) })).filter((s) => s.title || s.body)
  if (items.length === 0) return null
  return (
    <section className={cls('wh-block wh-block-path', pad, vis)}>
      {(label || heading || note) && (
        <div className="wh-block-head wh-block-head-row">
          <div>
            {label && <span className="wh-label wh-label-ink">{label}</span>}
            <Title text={heading ?? ''} accent={accentWord} />
          </div>
          {note && <span className="wh-label">{note}</span>}
        </div>
      )}
      <ol className="wh-path" style={{ ['--wh-path-n' as string]: items.length }}>
        {items.map((s, i) => {
          const inner = (
            <>
              <span className="wh-path-moon"><WhMoon phase={stepPhase(i, items.length)} size={34} /></span>
              <span className="wh-label">{ROMAN(i)}</span>
              <h3>{s.title}</h3>
              {s.body && <p>{s.body}</p>}
            </>
          )
          return <li key={i}>{s.href ? <a className="wh-path-link" href={s.href}>{inner}</a> : inner}</li>
        })}
      </ol>
    </section>
  )
}

// 4d. Seal cards: a grid of cards each opened by a seal (a glyph in its ring), a title, a line and a note.
export function WildheartSealCardsBlock({ label, heading, accentWord, lead, cards, columns = 4, pad, vis }: {
  label?: string; heading?: string; accentWord?: string; lead?: string; cards: Props[]; columns?: number; pad?: string; vis?: string
}) {
  const items = cards.map((c) => ({ glyph: str(c.glyph) || 'spark', title: str(c.title), body: str(c.body), note: str(c.note) })).filter((c) => c.title || c.body)
  if (items.length === 0) return null
  return (
    <section className={cls('wh-block wh-block-seals', pad, vis)}>
      <Head label={label} heading={undefined} lead={lead} />
      {heading && <Title text={heading} accent={accentWord} className="wh-block-title" />}
      <ul className="wh-seals" data-cols={Math.max(1, Math.min(4, Math.round(columns)))}>
        {items.map((c, i) => (
          <li key={i}>
            <WhSeal name={c.glyph} size={52} />
            <h3>{c.title}</h3>
            {c.body && <p>{c.body}</p>}
            {c.note && <span className="wh-label">{c.note}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

type SpaceEventLite = SpaceEvent

/** The Space's upcoming events from the metadata channel, soonest first from `now`. */
function upcoming(metadata: Record<string, unknown> | undefined, now: Date): SpaceEventLite[] {
  const today = isoDay(now)
  return spaceEvents(metadata)
    .filter((e) => e.startsAt.slice(0, 10) >= today)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

function eventHref(e: SpaceEventLite, metadata: Record<string, unknown> | undefined): string | null {
  const space = metadata?.space as { slug?: string } | undefined
  const origin = (metadata?.links as SiteLinkMap | undefined)?.origin
  if (typeof e.href === 'string' && e.href) return e.href
  if (!e.slug) return null
  return origin ? `${origin}/events/${e.slug}` : space?.slug ? `/events/${e.slug}` : null
}

/** One dated row for a Space event (the handoff's EventRow): its date, its mark (the day's moon for a
 *  moon circle, the star for a festival, the sign for a Circle Night, the season seed otherwise), its
 *  title and its note. */
function SpaceEventRow({ e, metadata, festivalsOf }: { e: SpaceEventLite; metadata?: Record<string, unknown>; festivalsOf: Set<string> }) {
  const day = parseDay(e.startsAt)
  const when = dateLabel(e.startsAt)
  const href = eventHref(e, metadata)
  const s = day ? sky(day) : null
  const t = norm(e.title)
  // A "new moon" title is the dark phase, a "full moon" or a bare "... moon" the full one, else the sky's.
  const moonPhase = t.includes('new') ? 0 : t.includes('full') || t.endsWith('moon') ? 4 : s?.phase ?? 0
  const mark = !s ? <WhGlyph name="spark" size={14} /> : t.includes('moon') ? <WhMoon phase={moonPhase} size={16} /> : festivalsOf.has(t) ? <WhGlyph name="star" size={15} /> : /circle night/.test(t) ? <WhGlyph name={s.sign} size={15} /> : <span className="wh-seed" data-season={s.season} aria-hidden="true" />
  const note = noteOf(e)
  const body = (
    <>
      <span className="wh-row-date">{when.day.replace(/^\w+ /, '')}</span>
      <span className="wh-row-mark">{mark}</span>
      <span className="wh-row-text">
        <span className="wh-row-title">{e.title}</span>
        {note && <span className="wh-row-note">{note}</span>}
      </span>
    </>
  )
  return href ? <a className="wh-row" href={href}>{body}</a> : <div className="wh-row">{body}</div>
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const timeRange = (startsAt: string, endsAt?: string | null) => {
  const a = dateLabel(startsAt)
  const b = endsAt ? dateLabel(endsAt) : null
  if (!a.time) return ''
  if (!b?.time || b.day !== a.day) return a.time
  const [ta, pa] = a.time.split(' ')
  const [tb, pb] = b.time.split(' ')
  return pa === pb ? `${ta} – ${tb} ${pb}` : `${a.time} – ${b.time}`
}

// 4e. The season band (the handoff's "This season"): the module now (from the block's twelve) with its
//     photo, the next gathering's date with its beats, and the next rituals with a constellation, inside
//     the season's own colours. The dates are the Space's own events.
export function WildheartSeasonBandBlock({ label, heading, accentWord, image, alt, modules, nowNote, beats, gatheringLabel, gatheringNote, ritualsLabel, ctaLabel, ctaHref, yearLabel, yearHref, now = new Date(), metadata, pad, vis }: {
  label?: string; heading?: string; accentWord?: string; image?: unknown; alt?: string; modules: Props[]; nowNote?: string; beats: Props[]; gatheringLabel?: string; gatheringNote?: string; ritualsLabel?: string
  ctaLabel?: string; ctaHref?: string; yearLabel?: string; yearHref?: string; now?: Date; metadata?: Record<string, unknown>; pad?: string; vis?: string
}) {
  const s = sky(now)
  const mod = modules.map((m) => ({ sign: str(m.sign).toLowerCase(), title: str(m.title), theme: str(m.theme) })).find((m) => m.sign === s.sign)
  const title = mod?.title || `${s.house} · ${s.houseName}`
  const events = upcoming(metadata, now)
  const match = gatheringLabel ? new RegExp(gatheringLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null
  const gathering = match ? events.find((e) => match.test(e.title)) ?? null : null
  const rituals = events.filter((e) => !(match && match.test(e.title)) && !/week \d/i.test(e.title)).slice(0, 3)
  const beatRows = beats.map((b) => ({ letter: str(b.letter).toUpperCase(), word: str(b.word) })).filter((b) => b.letter || b.word)
  const cta = hrefOf(str(ctaHref), metadata)
  const year = hrefOf(str(yearHref), metadata)
  const when = gathering ? dateLabel(gathering.startsAt) : null
  const weekday = gathering ? WEEKDAYS[(parseDay(gathering.startsAt)?.getUTCDay() ?? 0)] : ''
  const fest = new Set(festivals(now.getUTCFullYear()).concat(festivals(now.getUTCFullYear() + 1)).map((f) => norm(f.title)))
  fest.add('lammas')
  const nextSign = ZODIAC[(ZODIAC.findIndex((z) => z.id === s.sign) + 1) % 12]
  return (
    <section className={cls('wh-block wh-block-season', pad, vis)} data-season={s.season}>
      <div className="wh-block-head wh-block-head-row">
        <div>
          <WildheartNowLine date={now} show={['season', 'sign']} />
          <Title text={heading ?? ''} accent={accentWord} />
          {label && <span className="wh-label">{label}</span>}
        </div>
        {year && yearLabel && <a className="wh-textlink" href={year}>{yearLabel}</a>}
      </div>
      <div className="wh-season-grid">
        <article className="wh-card wh-card-now">
          {img(image) && (
            <figure className="wh-frame wh-card-photo" data-shape="rect" data-grade="warm">
              {/* eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host */}
              <img src={img(image)!} alt={alt ?? ''} loading="lazy" />
              <span className="wh-frame-grade" aria-hidden="true" />
            </figure>
          )}
          <span className="wh-card-row">
            <WhGlyph name={s.sign} size={22} />
            <span className="wh-tag wh-tag-season">Now · until {shortDay(s.range[1])}</span>
          </span>
          <h3>{title}</h3>
          {(mod?.theme || nowNote) && <p>{[mod?.theme ? `${mod.theme}.` : '', nowNote].filter(Boolean).join(' ')}</p>}
          <span className="sr-only">{nextSign.name}</span>
        </article>
        <article className="wh-card wh-card-next">
          <span className="wh-label wh-label-ink">{gathering && gatheringLabel ? `Next ${gatheringLabel}` : gathering ? `Next · ${gathering.title}` : 'Next'}</span>
          {when ? <span className="wh-card-date">{when.day.replace(/^\w+ /, '')}</span> : <span className="wh-card-date">Soon</span>}
          {gathering && (when?.time || gatheringNote) && <p>{[weekday, timeRange(gathering.startsAt, gathering.endsAt), gatheringNote].filter(Boolean).join(' · ')}</p>}
          {beatRows.length > 0 && (
            <ol className="wh-beats-list">
              {beatRows.map((b, i) => (
                <li key={i}><span className="wh-beat-letter">{b.letter}</span><span className="wh-label">{b.word}</span></li>
              ))}
            </ol>
          )}
          {cta && ctaLabel && <a className="hs-btn hs-btn-secondary wh-btn-sm" href={cta}>{ctaLabel}</a>}
        </article>
        <article className="wh-card wh-card-sky">
          <span className="wh-label wh-label-ink">{ritualsLabel || 'Next rituals'}</span>
          {rituals.length > 0 ? (
            <ol className="wh-rows">
              {rituals.map((e) => (
                <li key={e.id}><SpaceEventRow e={e} metadata={metadata} festivalsOf={fest} /></li>
              ))}
            </ol>
          ) : (
            <p className="wh-journey-empty">A quiet stretch of sky.</p>
          )}
          <span className="wh-card-glyph"><WhConstellation sign={nextSign.id} size={110} /></span>
        </article>
      </div>
    </section>
  )
}

// 4f. The retreat band: a dusk-graded photo with a seal, the dated label with a moon, a display title,
//     three day tiles, two buttons and a note, on smoke and the dusk gradient, bleeding to the window.
export function WildheartRetreatBandBlock({ label, heading, accentWord, lead, days, ctaLabel, ctaHref, secondaryLabel, secondaryHref, note, image, alt, seal, pad, vis, metadata }: {
  label?: string; heading?: string; accentWord?: string; lead?: string; days: Props[]; ctaLabel?: string; ctaHref?: string; secondaryLabel?: string; secondaryHref?: string
  note?: string; image?: unknown; alt?: string; seal?: string; pad?: string; vis?: string; metadata?: Record<string, unknown>
}) {
  const src = img(image)
  const tiles = days.map((d) => ({ label: str(d.label), title: str(d.title), body: str(d.body), accent: d.accent === true })).filter((d) => d.title || d.label)
  return (
    <section className={cls('wh-block wh-block-retreat', pad, vis)}>
      <div className="wh-retreat" style={{ position: 'relative', overflow: 'hidden' }}>
        {seal && <span className="wh-retreat-watermark" aria-hidden="true"><WhGlyph name={seal} size={460} watermark /></span>}
        <div className="wh-retreat-in">
          {src && (
            <div className="wh-retreat-photo">
              <figure className="wh-frame" data-shape="arch" data-grade="dusk">
                {/* eslint-disable-next-line @next/next/no-img-element -- owner photo on an arbitrary host */}
                <img src={src} alt={alt ?? ''} loading="lazy" />
                <span className="wh-frame-grade" aria-hidden="true" />
              </figure>
              {seal && <span className="wh-retreat-seal"><WhSeal name={seal} size={84} /></span>}
            </div>
          )}
          <div className="wh-retreat-copy">
            {label && <span className="wh-label wh-label-ink wh-label-moon"><WhMoon phase={0} size={14} />{label}</span>}
            <Title text={heading ?? ''} accent={accentWord} className="wh-title-l wh-title-madder" />
            {lead && <p className="wh-lead">{lead}</p>}
            {tiles.length > 0 && (
              <ol className="wh-days">
                {tiles.map((d, i) => (
                  <li key={i} data-accent={d.accent ? '' : undefined}>
                    <span className="wh-label">{d.label}</span>
                    <h3>{d.title}</h3>
                    {d.body && <p>{d.body}</p>}
                  </li>
                ))}
              </ol>
            )}
            <Buttons primary={ctaLabel} primaryHref={ctaHref} secondary={secondaryLabel} secondaryHref={secondaryHref} secondaryKind="ghost" metadata={metadata} />
            {note && <span className="wh-label">{note}</span>}
          </div>
        </div>
      </div>
    </section>
  )
}

// 4g. The mark split: the mark (the handoff's LogoMark, twilight, from the Space's own name) in a washed
//     card beside a heading, a lead, the ornament, a body and a note card. The About page's shape.
export function WildheartMarkSplitBlock({ label, heading, accentWord, lead, body, note, metadata, pad, vis }: {
  label?: string; heading?: string; accentWord?: string; lead?: string; body?: string; note?: string; metadata?: Record<string, unknown>; pad?: string; vis?: string
}) {
  const space = metadata?.space as { name?: string; logoUrl?: string | null } | undefined
  const name = str(space?.name)
  return (
    <section className={cls('wh-block wh-block-mark', pad, vis)}>
      <div className="wh-mark-split">
        <div className="wh-mark-card">
          {name ? <WhLogoMark name={name} size={360} tone="twilight" className="wh-mark-logo" /> : <span className="wh-mark-name" />}
        </div>
        <div className="wh-mark-copy">
          {label && <span className="wh-label wh-label-ink">{label}</span>}
          <Title text={heading ?? ''} accent={accentWord} as="h1" className="wh-title-l" />
          {lead && <p className="wh-lead">{lead}</p>}
          <WhOrnament />
          {body && <p className="wh-body">{body}</p>}
          {note && <p className="wh-note">{note}</p>}
        </div>
      </div>
    </section>
  )
}

// 4h. The moon strip: a heading with a row of moons counting the weeks or seats of something beside it.
export function WildheartMoonStripBlock({ heading, label, total = 8, done = 0, pad, vis }: { heading?: string; label?: string; total?: number; done?: number; pad?: string; vis?: string }) {
  return (
    <div className={cls('wh-block wh-block-moonstrip', pad, vis)}>
      <div className="wh-block-head wh-block-head-row wh-moonstrip-head">
        <div>{heading && <Title text={heading} className="wh-title-s" />}</div>
        <WhMoonPhases total={num(total, 8)} done={num(done, 0)} size={14} label={label || undefined} />
      </div>
    </div>
  )
}

// 4i. The modules: one card per sign (its season's colour on top, the sign and its house, the module and
//     its theme), in the order the year walks them from the sign the block starts on.
export function WildheartModulesBlock({ heading, modules, pad, vis }: { heading?: string; modules: Props[]; pad?: string; vis?: string }) {
  const items = modules.map((m) => ({ sign: str(m.sign).toLowerCase(), title: str(m.title), theme: str(m.theme) })).filter((m) => ZODIAC.some((z) => z.id === m.sign) && m.title)
  if (items.length === 0) return null
  return (
    <section className={cls('wh-block wh-block-modules', pad, vis)}>
      {heading && <Title text={heading} className="wh-title-s wh-block-title" />}
      <ul className="wh-modules">
        {items.map((m) => {
          const z = ZODIAC.find((x) => x.id === m.sign)!
          const season = ({ capricorn: 'winter', aquarius: 'winter', pisces: 'winter', aries: 'spring', taurus: 'spring', gemini: 'spring', cancer: 'summer', leo: 'summer', virgo: 'summer', libra: 'fall', scorpio: 'fall', sagittarius: 'fall' } as Record<string, string>)[m.sign]
          return (
            <li key={m.sign} data-season={season}>
              <span className="wh-module-top">
                <span className="wh-label wh-label-season">{z.name} · {z.house}</span>
                <WhGlyph name={z.id} size={20} />
              </span>
              <h3>{m.title}</h3>
              {m.theme && <p>{m.theme}</p>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// 4j. Your first night: the four-way choice of how to arrive, with the next gathering's date in its label.
export function WildheartFirstNightBlock({ label, gatheringLabel, heading, question, options, chosenLabel, ctaLabel, ctaHref, now = new Date(), metadata, pad, vis }: {
  label?: string; gatheringLabel?: string; heading?: string; question?: string; options: Props[]; chosenLabel?: string; ctaLabel?: string; ctaHref?: string; now?: Date; metadata?: Record<string, unknown>; pad?: string; vis?: string
}) {
  const opts = options.map((o) => ({ label: str(o.label), sub: str(o.sub), note: str(o.note) })).filter((o) => o.label)
  if (opts.length === 0) return null
  const match = gatheringLabel ? new RegExp(gatheringLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null
  const next = match ? upcoming(metadata, now).find((e) => match.test(e.title)) ?? null : null
  const when = next ? dateLabel(next.startsAt) : null
  const short = when?.time ? when.time.replace(/:00 /, ' ') : ''
  return (
    <section className={cls('wh-block wh-block-firstnight', pad, vis)}>
      <div className="wh-fn">
        <span className="wh-label wh-label-ink">{[label, when ? `${when.day}${short ? ` · ${short}` : ''}` : ''].filter(Boolean).join(' · ')}</span>
        {heading && <span className="wh-fn-title">{heading}</span>}
        {question && <span className="wh-fn-question">{question}</span>}
        <WildheartFirstNight options={opts} chosen={chosenLabel || 'Chosen'} cta={ctaLabel || 'Save my place'} href={hrefOf(str(ctaHref), metadata)} />
      </div>
    </section>
  )
}

const yearField = { type: 'number', label: 'Year (blank for this year)', min: 1970, max: 2200 } as const
const layoutOf = (layout: unknown) => ({ pad: padClass(layout as LayoutValue), vis: visClass(layout as LayoutValue) })

/** The theme's own twelve house names, in the order the year walks them from Capricorn. Block content,
 *  not a navigation catalog: it feeds the season band's and the sky map's default copy. */
const ZODIAC_HOUSES = [...ZODIAC.slice(9), ...ZODIAC.slice(0, 9)].map((z) => ({ sign: z.id, title: z.houseName, theme: `${z.house} · ${z.name}` }))
const modulesField = { type: 'array', label: 'The twelve modules (one per sign)', arrayFields: { sign: { type: 'select', label: 'Sign', options: ZODIAC.map((z) => ({ label: z.name, value: z.id })) }, title: { type: 'text', label: 'Module' }, theme: { type: 'text', label: 'Theme' } }, getItemSummary: (item: Props) => `${str(item.sign)}: ${str(item.title)}` } as const

export const wildheartComponents: Record<string, ComponentConfig> = {
  WildheartYearJourney: {
    label: 'Year journey (the pinned wheel)',
    fields: {
      label: { type: 'text' },
      heading: { type: 'textarea' },
      lead: { type: 'textarea' },
      year: yearField,
      modules: modulesField,
      programStops: { type: 'array', label: 'The program\'s own stops (matched in event titles)', arrayFields: { match: { type: 'text', label: 'Event title contains' }, after: { type: 'text', label: 'Only after the last event containing (optional)' }, title: { type: 'text', label: 'Stop title' }, note: { type: 'text', label: 'Note' }, teach: { type: 'textarea', label: 'A line about it' } }, getItemSummary: (item: Props) => str(item.title) || str(item.match) || 'Stop' },
      enrollHref: { type: 'text', label: '"Save my place" link' },
      yearHref: { type: 'text', label: 'Sky map link' },
      layout: layoutField,
    },
    defaultProps: {
      label: 'The year',
      heading: 'Every season has a door.',
      lead: 'Scroll, or spin the wheel and let it coast. The needle at the top reads all four rings at once: the date, the sun\'s sign, the season and the moon.',
      year: 0,
      modules: ZODIAC_HOUSES,
      programStops: [],
      enrollHref: '',
      yearHref: '',
      layout: layoutDefault,
    },
    render: ({ label, heading, lead, year, modules, programStops, enrollHref, yearHref, layout, puck }) => (
      <WildheartYearJourneyBlock label={label || undefined} heading={heading || undefined} lead={lead || undefined} year={year} modules={arr(modules)} programStops={arr(programStops)} enrollHref={enrollHref || undefined} yearHref={yearHref || undefined} metadata={puck?.metadata} {...layoutOf(layout)} />
    ),
  },
  WildheartSkyMap: {
    label: 'Sky map (the calendar wheel)',
    fields: {
      label: { type: 'text' },
      heading: { type: 'textarea' },
      lead: { type: 'textarea' },
      year: yearField,
      wheel: { type: 'select', label: 'Layout', options: [{ label: 'Centered (a year page)', value: 'centered' }, { label: 'Compact (a phone)', value: 'compact' }] },
      modules: modulesField,
      layout: layoutField,
    },
    defaultProps: {
      label: 'The sky this year',
      heading: 'One wheel. The whole year.',
      lead: 'Festivals, moons and gatherings, placed on the wheel where they fall. Come back to it whenever you need to know where you are.',
      year: 0,
      wheel: 'centered',
      modules: ZODIAC_HOUSES,
      layout: layoutDefault,
    },
    render: ({ label, heading, lead, year, wheel, modules, layout, puck }) => (
      <WildheartSkyMapBlock label={label || undefined} heading={heading || undefined} lead={lead || undefined} year={year} layout={wheel} modules={arr(modules)} metadata={puck?.metadata} {...layoutOf(layout)} />
    ),
  },
  WildheartNowLine: {
    label: 'Date line (today in the sky)',
    fields: { layout: layoutField },
    defaultProps: { layout: layoutDefault },
    render: ({ layout }) => <WildheartNowLineBlock {...layoutOf(layout)} />,
  },
  WildheartOrnament: {
    label: 'Ornament (a rule with a mark)',
    fields: {
      variant: { type: 'select', label: 'Mark', options: [{ label: 'Moons', value: 'moons' }, { label: 'Star', value: 'star' }, { label: 'Phases', value: 'phases' }, { label: 'Bridge (down to a new moon)', value: 'bridge' }] },
      label: { type: 'text', label: 'Label (bridge only)' },
      layout: layoutField,
    },
    defaultProps: { variant: 'moons', label: '', layout: layoutDefault },
    render: ({ variant, label, layout }) => <WildheartOrnamentBlock variant={variant} label={label || undefined} {...layoutOf(layout)} />,
  },
  WildheartPhoto: {
    label: 'Photo frame (arch, petal, circle)',
    fields: {
      image: imgField,
      alt: { type: 'text', label: 'Alt text' },
      shape: { type: 'select', label: 'Shape', options: [{ label: 'Arch', value: 'arch' }, { label: 'Petal', value: 'petal' }, { label: 'Circle', value: 'circle' }, { label: 'Rectangle', value: 'rect' }] },
      grade: { type: 'select', label: 'Grade', options: [{ label: 'Warm', value: 'warm' }, { label: 'Dusk', value: 'dusk' }, { label: 'None', value: 'none' }] },
      height: { type: 'number', label: 'Height (px)', min: 160, max: 720 },
      caption: { type: 'text', label: 'Caption' },
      credit: { type: 'text', label: 'Photo credit' },
      watermark: { type: 'select', label: 'Watermark glyph', options: [{ label: 'None', value: '' }, ...GLYPH_OPTIONS] },
      layout: layoutField,
    },
    defaultProps: { image: '', alt: '', shape: 'arch', grade: 'warm', height: 420, caption: '', credit: '', watermark: '', layout: layoutDefault },
    render: ({ image, alt, shape, grade, height, caption, credit, watermark, layout }) => (
      <WildheartPhotoBlock image={image} alt={alt} shape={shape} grade={grade} height={num(height, 420)} caption={caption || undefined} credit={credit || undefined} watermark={watermark || undefined} {...layoutOf(layout)} />
    ),
  },
  WildheartMoonPath: {
    label: 'Moon path (steps, new moon to full)',
    fields: {
      label: { type: 'text', label: 'Eyebrow' },
      heading: { type: 'textarea', label: 'Heading' },
      accentWord: { type: 'text', label: 'Accent word (optional)' },
      note: { type: 'text', label: 'Note (right of the heading)' },
      steps: { type: 'array', label: 'Steps', arrayFields: { title: { type: 'text', label: 'Title' }, body: { type: 'textarea', label: 'Line' }, href: { type: 'text', label: 'Link (optional)' } }, getItemSummary: (item: Props) => str(item.title) || 'Step' },
      layout: layoutField,
    },
    defaultProps: {
      label: 'The path',
      heading: 'Wax at your own pace.',
      accentWord: '',
      note: 'New moon to full',
      steps: [
        { title: 'Visit', body: 'Come once. Watch, or join in.', href: '' },
        { title: 'Join', body: 'Take a seat in a circle.', href: '' },
        { title: 'Practise', body: 'A short practice you can keep.', href: '' },
        { title: 'Gather', body: 'The festivals and every moon.', href: '' },
        { title: 'Lead', body: 'Hold a circle of your own.', href: '' },
      ],
      layout: layoutDefault,
    },
    render: ({ label, heading, accentWord, note, steps, layout, puck }) => (
      <WildheartMoonPathBlock label={label || undefined} heading={heading || undefined} accentWord={accentWord || undefined} note={note || undefined} steps={arr(steps)} metadata={puck?.metadata} {...layoutOf(layout)} />
    ),
  },
  WildheartSealCards: {
    label: 'Seal cards (a glyph, a title, a line)',
    fields: {
      label: { type: 'text', label: 'Eyebrow' },
      heading: { type: 'textarea', label: 'Heading' },
      accentWord: { type: 'text', label: 'Accent word (optional)' },
      lead: { type: 'textarea', label: 'Lead (optional)' },
      columns: { type: 'select', label: 'Columns', options: [{ label: '2', value: 2 }, { label: '3', value: 3 }, { label: '4', value: 4 }] },
      cards: { type: 'array', label: 'Cards', arrayFields: { glyph: glyphField, title: { type: 'text', label: 'Title' }, body: { type: 'textarea', label: 'Line' }, note: { type: 'text', label: 'Note (small caps)' } }, getItemSummary: (item: Props) => str(item.title) || 'Card' },
      layout: layoutField,
    },
    defaultProps: {
      label: 'The four elements',
      heading: 'Will, feeling, breath, body.',
      accentWord: '',
      lead: '',
      columns: 4,
      cards: [
        { glyph: 'fire', title: 'Fire', body: 'What you want, said out loud.', note: 'Will' },
        { glyph: 'water', title: 'Water', body: 'What moves when you let it.', note: 'Feeling' },
        { glyph: 'air', title: 'Air', body: 'Breath, sound, the first loud note.', note: 'Breath' },
        { glyph: 'earth', title: 'Earth', body: 'The ground you stand on.', note: 'Body' },
      ],
      layout: layoutDefault,
    },
    render: ({ label, heading, accentWord, lead, columns, cards, layout }) => (
      <WildheartSealCardsBlock label={label || undefined} heading={heading || undefined} accentWord={accentWord || undefined} lead={lead || undefined} columns={num(columns, 4)} cards={arr(cards)} {...layoutOf(layout)} />
    ),
  },
  WildheartSeasonBand: {
    label: 'This season (module now, next gathering, next days)',
    fields: {
      heading: { type: 'textarea', label: 'Heading' },
      accentWord: { type: 'text', label: 'Accent word (optional)' },
      label: { type: 'text', label: 'Line under the heading' },
      image: imgField,
      alt: { type: 'text', label: 'Alt text (the module card photo)' },
      modules: modulesField,
      nowNote: { type: 'text', label: 'A line after the module now' },
      gatheringLabel: { type: 'text', label: 'The gathering to feature (matched in event titles)' },
      gatheringNote: { type: 'text', label: 'A line under its date' },
      beats: { type: 'array', label: 'Its beats (a letter and a word)', arrayFields: { letter: { type: 'text', label: 'Letter' }, word: { type: 'text', label: 'Word' } }, getItemSummary: (item: Props) => str(item.word) || 'Beat' },
      ritualsLabel: { type: 'text', label: 'The next days\' label' },
      ctaLabel: { type: 'text', label: 'Button label' },
      ctaHref: { type: 'text', label: 'Button link' },
      yearLabel: { type: 'text', label: 'Year link label' },
      yearHref: { type: 'text', label: 'Year link' },
      layout: layoutField,
    },
    defaultProps: {
      heading: 'This season, we go *deeper.*',
      accentWord: '',
      label: '',
      image: '',
      alt: '',
      modules: ZODIAC_HOUSES,
      nowNote: '',
      gatheringLabel: 'Gathering',
      gatheringNote: '',
      beats: [],
      ritualsLabel: 'Next rituals',
      ctaLabel: '',
      ctaHref: '',
      yearLabel: 'See the year →',
      yearHref: '',
      layout: layoutDefault,
    },
    render: ({ heading, accentWord, label, image, alt, modules, nowNote, gatheringLabel, gatheringNote, beats, ritualsLabel, ctaLabel, ctaHref, yearLabel, yearHref, layout, puck }) => (
      <WildheartSeasonBandBlock heading={heading || undefined} accentWord={accentWord || undefined} label={label || undefined} image={image} alt={alt} modules={arr(modules)} nowNote={nowNote || undefined} beats={arr(beats)} gatheringLabel={gatheringLabel || undefined} gatheringNote={gatheringNote || undefined} ritualsLabel={ritualsLabel || undefined} ctaLabel={ctaLabel || undefined} ctaHref={ctaHref || undefined} yearLabel={yearLabel || undefined} yearHref={yearHref || undefined} metadata={puck?.metadata} {...layoutOf(layout)} />
    ),
  },
  WildheartRetreatBand: {
    label: 'Weekend band (photo, seal, day tiles)',
    fields: {
      image: imgField,
      alt: { type: 'text', label: 'Alt text' },
      seal: { type: 'select', label: 'Seal glyph', options: [{ label: 'None', value: '' }, ...GLYPH_OPTIONS] },
      label: { type: 'text', label: 'Dated label' },
      heading: { type: 'textarea', label: 'Heading' },
      accentWord: { type: 'text', label: 'Accent word (optional)' },
      lead: { type: 'textarea', label: 'Lead' },
      days: { type: 'array', label: 'Day tiles', arrayFields: { label: { type: 'text', label: 'Label (Fri · Arrive)' }, title: { type: 'text', label: 'Title' }, body: { type: 'text', label: 'Line' } }, getItemSummary: (item: Props) => str(item.title) || 'Day' },
      ctaLabel: { type: 'text', label: 'Button label' },
      ctaHref: { type: 'text', label: 'Button link' },
      secondaryLabel: { type: 'text', label: 'Second button label' },
      secondaryHref: { type: 'text', label: 'Second button link' },
      note: { type: 'text', label: 'Note under the buttons' },
      layout: layoutField,
    },
    defaultProps: {
      image: '',
      alt: '',
      seal: 'moon',
      label: 'A weekend away',
      heading: 'Three nights in the *wild dark.*',
      accentWord: '',
      lead: 'Everyone together, apart from the everyday. Arrive, go deep, come back.',
      days: [
        { label: 'Day one · Arrive', title: 'The threshold', body: 'Fire lit, circle cast, the first sound.' },
        { label: 'Day two · Deepen', title: 'The long night', body: 'Movement, release, and a night vigil.' },
        { label: 'Day three · Return', title: 'The new year', body: 'Rest, intentions, and joy before home.' },
      ],
      ctaLabel: 'Hold my place',
      ctaHref: '',
      secondaryLabel: '',
      secondaryHref: '',
      note: '',
      layout: layoutDefault,
    },
    render: ({ image, alt, seal, label, heading, accentWord, lead, days, ctaLabel, ctaHref, secondaryLabel, secondaryHref, note, layout, puck }) => (
      <WildheartRetreatBandBlock image={image} alt={alt} seal={seal || undefined} label={label || undefined} heading={heading || undefined} accentWord={accentWord || undefined} lead={lead || undefined} days={arr(days)} ctaLabel={ctaLabel || undefined} ctaHref={ctaHref || undefined} secondaryLabel={secondaryLabel || undefined} secondaryHref={secondaryHref || undefined} note={note || undefined} metadata={puck?.metadata} {...layoutOf(layout)} />
    ),
  },
  WildheartMarkSplit: {
    label: 'Mark split (the logo beside the words)',
    fields: {
      label: { type: 'text', label: 'Eyebrow' },
      heading: { type: 'textarea', label: 'Heading' },
      accentWord: { type: 'text', label: 'Accent word (optional)' },
      lead: { type: 'textarea', label: 'Lead' },
      body: { type: 'textarea', label: 'Body' },
      note: { type: 'textarea', label: 'Note card' },
      layout: layoutField,
    },
    defaultProps: {
      label: 'About',
      heading: 'A circle for everyone who wants to be *free.*',
      accentWord: '',
      lead: 'A year-round circle: come back into your body and let what is inside move out, in movement, voice, play and presence.',
      body: '',
      note: 'Practice and community, not therapy or crisis care.',
      layout: layoutDefault,
    },
    render: ({ label, heading, accentWord, lead, body, note, layout, puck }) => (
      <WildheartMarkSplitBlock label={label || undefined} heading={heading || undefined} accentWord={accentWord || undefined} lead={lead || undefined} body={body || undefined} note={note || undefined} metadata={puck?.metadata} {...layoutOf(layout)} />
    ),
  },
  WildheartMoonStrip: {
    label: 'Moon strip (a heading, a count in moons)',
    fields: { heading: { type: 'textarea', label: 'Heading' }, label: { type: 'text', label: 'Label after the moons' }, total: { type: 'number', label: 'Total', min: 1, max: 24 }, done: { type: 'number', label: 'Done', min: 0, max: 24 }, layout: layoutField },
    defaultProps: { heading: '', label: 'Eight weeks', total: 8, done: 0, layout: layoutDefault },
    render: ({ heading, label, total, done, layout }) => <WildheartMoonStripBlock heading={heading || undefined} label={label || undefined} total={total} done={done} {...layoutOf(layout)} />,
  },
  WildheartModules: {
    label: 'Module cards (one per sign)',
    fields: { heading: { type: 'textarea', label: 'Heading' }, modules: modulesField, layout: layoutField },
    defaultProps: { heading: 'Twelve modules', modules: ZODIAC_HOUSES, layout: layoutDefault },
    render: ({ heading, modules, layout }) => <WildheartModulesBlock heading={heading || undefined} modules={arr(modules)} {...layoutOf(layout)} />,
  },
  WildheartFirstNight: {
    label: 'Your first night (how would you like to arrive)',
    fields: {
      label: { type: 'text', label: 'Eyebrow' },
      gatheringLabel: { type: 'text', label: 'The gathering whose date follows it (matched in event titles)' },
      heading: { type: 'text', label: 'Heading' },
      question: { type: 'text', label: 'The question' },
      options: { type: 'array', label: 'The choices', arrayFields: { label: { type: 'text', label: 'Choice' }, sub: { type: 'text', label: 'Under it' }, note: { type: 'textarea', label: 'The note once picked' } }, getItemSummary: (item: Props) => str(item.label) || 'Choice' },
      chosenLabel: { type: 'text', label: '"Chosen" label' },
      ctaLabel: { type: 'text', label: 'Button label' },
      ctaHref: { type: 'text', label: 'Button link' },
      layout: layoutField,
    },
    defaultProps: {
      label: 'Your first night',
      gatheringLabel: 'Gathering',
      heading: 'Come as you are.',
      question: 'How would you like to arrive?',
      options: [
        { label: 'Join in', sub: 'All of it', note: 'Lovely. Your host will save you a place.' },
        { label: 'Go gently', sub: 'At my pace', note: 'Every practice can be softened. Your host will know.' },
        { label: 'Witness', sub: 'Just watch', note: 'You are welcome to sit and watch the whole night.' },
        { label: 'Not sure', sub: 'Ask me first', note: 'Your host will message you before the night to talk it through.' },
      ],
      chosenLabel: 'Chosen',
      ctaLabel: 'Save my place',
      ctaHref: '',
      layout: layoutDefault,
    },
    render: ({ label, gatheringLabel, heading, question, options, chosenLabel, ctaLabel, ctaHref, layout, puck }) => (
      <WildheartFirstNightBlock label={label || undefined} gatheringLabel={gatheringLabel || undefined} heading={heading || undefined} question={question || undefined} options={arr(options)} chosenLabel={chosenLabel || undefined} ctaLabel={ctaLabel || undefined} ctaHref={ctaHref || undefined} metadata={puck?.metadata} {...layoutOf(layout)} />
    ),
  },
}

