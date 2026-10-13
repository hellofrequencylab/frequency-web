import type { ComponentConfig } from '@/lib/page-editor/types'
import { layoutField, layoutDefault, padClass, visClass, type LayoutValue } from '@/lib/page-editor/layout'
import { imgField } from '@/lib/page-editor/fields'
import {
  astrologyWheel,
  eventItems,
  isoDay,
  parseDay,
  shortDay,
  sky,
  skyItems,
  utcDate,
  type WheelItem,
  type WheelModel,
} from '@/lib/theme/astrology-wheel'
import { moonPhasePath, ZODIAC } from '@/lib/theme/wildheart-symbols'
import { safeImageSrc } from '@/lib/safe-image-src'
import { safeImageUrl } from '@/lib/entity-blocks/block-content'
import { siteLocalHref, type SiteLinkMap } from '@/lib/sites/house-theme'
import { dateLabel } from '@/lib/sites/menswork-page'
import { WildheartNowLine } from '@/components/sites/wildheart-now-line'
import { WhGlyph, WhMoon, WhMoonPhases, WhOrnament, WhSeal } from '@/components/sites/wildheart-symbols'
import { InlineText } from '@/components/sites/inline-text'

// ── The astrology calendar block family (Wildheart, owner brief 2026-10-12) ─────────────────────────
// Three renderings of ONE model (lib/theme/astrology-wheel.ts, pure): a scroll-through strip of the twelve
// signs for a Home page, a sky map (the SVG wheel) for a year page, and the date line for anywhere. Each
// sorts the year's festivals and moons (the sky's own, computed) and the Space's own events (injected at
// render time through `puck.metadata.space.events`, the same channel the Space blocks read) into their
// month and sign. Server Components, no client JS: the strip scrolls with CSS scroll snap.
//
// Every default word here is the THEME's, generic and gender-neutral (owner ruling 2026-10-12: Wildheart
// is a stock theme in the Frequency library). A Space's own events carry its own titles. The blocks read
// `--wh-*` tokens only; outside a Wildheart site they render in the page's own faces and colours.

type SpaceEvent = { id: string; slug?: string; title: string; startsAt: string }

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

function model(year: number, metadata: Record<string, unknown> | undefined): WheelModel {
  return astrologyWheel(year, [...skyItems(year), ...eventItems(spaceEvents(metadata))])
}

/** One dated item: its date, its mark (a moon, the festival star, a season seed), its title and note. */
function Row({ item, today }: { item: WheelItem; today: string }) {
  const mark = item.kind === 'moon' ? <WhMoon phase={item.phase} size={16} /> : item.kind === 'festival' ? <WhGlyph name="star" size={15} /> : <span className="wh-seed" data-season={item.season} aria-hidden="true" />
  const body = (
    <>
      <span className="wh-row-date">{shortDay(item.day)}</span>
      <span className="wh-row-mark">{mark}</span>
      <span className="wh-row-text">
        <span className="wh-row-title">{item.title}</span>
        {item.note && <span className="wh-row-note">{item.note}</span>}
      </span>
    </>
  )
  const current = isoDay(item.day) === today ? 'date' : undefined
  return item.href ? (
    <a className="wh-row" href={item.href} aria-current={current}>{body}</a>
  ) : (
    <div className="wh-row" aria-current={current}>{body}</div>
  )
}

function Head({ heading, lead, label }: { heading?: string; lead?: string; label?: string }) {
  if (!heading && !lead && !label) return null
  return (
    <div className="wh-block-head">
      {label && <span className="wh-label wh-label-ink">{label}</span>}
      {heading && <h2><InlineText text={heading} accentStars /></h2>}
      {lead && <p>{lead}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. The scroll-through strip: twelve signs in the order the year walks them, the items under each.
// ─────────────────────────────────────────────────────────────────────────────

export function WildheartYearJourneyBlock({ year, label, heading, lead, perSign = 6, now = new Date(), metadata, pad, vis }: {
  year?: number; label?: string; heading?: string; lead?: string; perSign?: number; now?: Date
  metadata?: Record<string, unknown>; pad?: string; vis?: string
}) {
  const y = wheelYear(year, now)
  const wheel = model(y, metadata)
  const today = isoDay(now)
  const current = now.getUTCFullYear() === y ? sky(now).sign : null
  return (
    <section className={`wh-block wh-block-journey ${pad ?? ''} ${vis ?? ''}`.trim()} data-season={current ? sky(now).season : undefined}>
      <Head label={label} heading={heading} lead={lead} />
      <ol className="wh-journey" aria-label={`The signs of ${y}`}>
        {wheel.signs.map((s) => (
          <li key={s.id} data-season={s.season} aria-current={s.id === current ? 'date' : undefined}>
            <div className="wh-journey-sign">
              <WhGlyph name={s.id} size={24} halo label={s.name} />
              <div>
                <span className="wh-journey-house">{s.house} · {s.houseName}</span>
                <h3>{s.name}</h3>
              </div>
            </div>
            <span className="wh-journey-range">{shortDay(s.start)} to {shortDay(s.end)} · {wheel.seasons.find((a) => a.id === s.season)?.name}</span>
            {s.items.length ? (
              <ol>
                {s.items.slice(0, Math.max(1, perSign)).map((it) => (
                  <li key={it.id}><Row item={it} today={today} /></li>
                ))}
              </ol>
            ) : (
              <p className="wh-journey-empty">A quiet stretch of sky.</p>
            )}
          </li>
        ))}
      </ol>
      <p className="wh-journey-hint">Scroll sideways to turn the year.</p>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. The sky map: an SVG wheel of twelve sectors, four season arcs, every item a dot on its date angle,
//    the moon at the centre, and the year's months listed beside it for every reader.
// ─────────────────────────────────────────────────────────────────────────────

/** A point on a circle of radius r (percent of the 100 unit viewBox) at angle a, 0 at the top. */
const P = (r: number, a: number): [number, number] => {
  const t = ((a - 90) * Math.PI) / 180
  return [+(50 + r * Math.cos(t)).toFixed(2), +(50 + r * Math.sin(t)).toFixed(2)]
}
const arc = (r: number, a0: number, a1: number) => {
  const [x0, y0] = P(r, a0)
  const [x1, y1] = P(r, a1)
  return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`
}

const RING = { cal: [49, 42], sky: [42, 33], season: 29.5, moon: 24 } as const
const DOT_RADIUS: Record<WheelItem['kind'], number> = { festival: 29.5, moon: 38, gathering: 45.5, event: 45.5 }

export function WildheartSkyMapBlock({ year, label, heading, lead, now = new Date(), metadata, pad, vis }: {
  year?: number; label?: string; heading?: string; lead?: string; now?: Date
  metadata?: Record<string, unknown>; pad?: string; vis?: string
}) {
  const y = wheelYear(year, now)
  const wheel = model(y, metadata)
  const today = isoDay(now)
  const inYear = now.getUTCFullYear() === y
  const s = sky(inYear ? now : utcDate(y, 1, 1))
  const needle = inYear ? wheel.months[0] && ((now.getTime() - Date.UTC(y, 0, 1)) / 864e5 / ((Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / 864e5)) * 360 : null
  const ticks = Array.from({ length: 73 }, (_, i) => (i * 5 * 360) / 365)
  const moon = moonPhasePath(s.phase, 11, 12, 12)
  return (
    <section className={`wh-block wh-block-skymap ${pad ?? ''} ${vis ?? ''}`.trim()} data-season={s.season}>
      <Head label={label} heading={heading} lead={lead} />
      <div className="wh-skymap">
        <div>
          <div className="wh-wheel" role="img" aria-label={`The wheel of ${y}: twelve signs, four seasons, ${wheel.items.length} dated days`}>
            <svg viewBox="0 0 100 100">
              <circle className="wh-wheel-ring" cx="50" cy="50" r={RING.cal[1]} />
              <circle className="wh-wheel-ring" cx="50" cy="50" r={RING.sky[1]} />
              {ticks.map((a, i) => {
                const [x0, y0] = P(RING.cal[0] - 0.2, a)
                const [x1, y1] = P(RING.cal[0] - 1.4, a)
                return <line key={i} className="wh-wheel-tick" x1={x0} y1={y0} x2={x1} y2={y1} />
              })}
              {wheel.months.map((m) => {
                const [x0, y0] = P(RING.cal[0], m.startAngle)
                const [x1, y1] = P(RING.cal[1], m.startAngle)
                const [lx, ly] = P((RING.cal[0] + RING.cal[1]) / 2, m.midAngle)
                return (
                  <g key={m.name}>
                    <line className="wh-wheel-month" x1={x0} y1={y0} x2={x1} y2={y1} />
                    <text className="wh-wheel-label" x={lx} y={ly}>{m.name}</text>
                  </g>
                )
              })}
              {wheel.signs.map((z) => {
                const [x0, y0] = P(RING.sky[0], z.startAngle)
                const [x1, y1] = P(RING.sky[1], z.startAngle)
                const [gx, gy] = P((RING.sky[0] + RING.sky[1]) / 2 + 1, z.midAngle)
                const [hx, hy] = P(RING.sky[1] + 1.6, z.midAngle)
                return (
                  <g key={z.id}>
                    {z.startAngle > 0 && <line className="wh-wheel-sign" x1={x0} y1={y0} x2={x1} y2={y1} />}
                    <text className="wh-wheel-glyph" x={gx} y={gy}>{z.glyph}</text>
                    <text className="wh-wheel-house" x={hx} y={hy}>{z.house}</text>
                  </g>
                )
              })}
              {wheel.seasons.map((a) => (
                <path key={a.id} className="wh-wheel-season" data-season={a.id} data-now={inYear && a.id === s.season ? '' : undefined} d={arc(RING.season, a.startAngle + 0.6, a.endAngle - 0.6)} />
              ))}
              {wheel.items.map((it) => {
                const [cx, cy] = P(DOT_RADIUS[it.kind], it.angle)
                return (
                  <circle key={it.id} className="wh-wheel-dot" data-kind={it.kind} cx={cx} cy={cy} r={it.kind === 'festival' ? 1.4 : 1}>
                    <title>{`${shortDay(it.day)} · ${it.title}`}</title>
                  </circle>
                )
              })}
              {needle !== null && (() => {
                const [x0, y0] = P(RING.moon + 1, needle)
                const [x1, y1] = P(RING.cal[0] + 1.5, needle)
                return (
                  <g>
                    <line className="wh-wheel-needle" x1={x0} y1={y0} x2={x1} y2={y1} />
                    <circle className="wh-wheel-needle-cap" cx={x1} cy={y1} r="1.6" />
                  </g>
                )
              })()}
            </svg>
            <svg className="wh-moon wh-wheel-moon" width="36%" height="36%" viewBox="0 0 24 24" role="img" aria-label={s.phaseName}>
              <circle className="wh-moon-dark" cx="12" cy="12" r="11" />
              {moon && <path className="wh-moon-lit" d={moon} />}
              <circle className="wh-moon-ring" cx="12" cy="12" r="11" />
            </svg>
          </div>
          <ul className="wh-legend" style={{ marginTop: 20 }}>
            <li><WhGlyph name="star" size={12} />Festivals</li>
            <li><WhMoon phase={4} size={12} />Moons</li>
            <li><span className="wh-seed" aria-hidden="true" />Gatherings</li>
          </ul>
        </div>
        <div className="wh-skymap-now">
          <span className="wh-label">{inYear ? shortDay(now) : `${y}`} · {s.seasonName} · {s.seasonTheme}</span>
          <h3>{s.signName} · {s.house} {s.houseName}</h3>
          <WildheartNowLine date={inYear ? now : utcDate(y, 1, 1)} show={['moon']} />
          <ol className="wh-skymap-months" aria-label={`Every dated day of ${y}, by month`}>
            {wheel.months.filter((m) => m.items.length).map((m) => (
              <li key={m.name}>
                <h4><span>{m.name}</span><WhGlyph name={sky(utcDate(y, m.index + 1, 15)).sign} size={16} /></h4>
                <ol>
                  {m.items.map((it) => (
                    <li key={it.id}><Row item={it} today={today} /></li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>
        </div>
      </div>
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
// 4. The composition pieces (LIVE-903, the fidelity passes against the design handoff): the pieces of
//    the handoff's six screens no generic block can carry. Each is one section, Server Component, no
//    client JS, theme-blind outside a Wildheart site (its classes read `--wh-*` with the page's own faces
//    and colours as fallbacks). Every default is the THEME's: generic words, no program, no gender.
// ─────────────────────────────────────────────────────────────────────────────

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

function Title({ text, accent, as: El = 'h2', className }: { text: string; accent?: string; as?: 'h1' | 'h2' | 'h3'; className?: string }) {
  if (!text) return null
  return (
    <El className={cls('wh-title', className)}>
      <InlineText text={text} accentStars accentWord={accent ?? ''} />
    </El>
  )
}

function Buttons({ primary, primaryHref, secondary, secondaryHref, metadata }: { primary?: string; primaryHref?: string; secondary?: string; secondaryHref?: string; metadata?: Record<string, unknown> }) {
  const a = primary && hrefOf(primaryHref ?? '', metadata)
  const b = secondary && hrefOf(secondaryHref ?? '', metadata)
  if (!a && !b) return null
  return (
    <div className="wh-actions">
      {a && <a className="hs-btn hs-btn-primary" href={a}>{primary}</a>}
      {b && <a className="hs-btn hs-btn-soft" href={b}>{secondary}</a>}
    </div>
  )
}

const GLYPH_OPTIONS = [...ZODIAC.map((z) => ({ label: z.name, value: z.id })), ...['fire', 'water', 'air', 'earth', 'quintessence', 'sun', 'moon', 'star', 'spark'].map((id) => ({ label: id[0].toUpperCase() + id.slice(1), value: id }))]
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
    <div className={cls('wh-block wh-block-photo', pad, vis)}>
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

/** The moon phase for step `i` of `n`, waxing from new (0) to full (4) across the steps. */
export const stepPhase = (i: number, n: number) => (n <= 1 ? 4 : Math.round((i / (n - 1)) * 4))

// 4c. The moon path: the steps of a path as a moon waxing from new to full, on one hairline.
export function WildheartMoonPathBlock({ label, heading, accentWord, note, steps, pad, vis }: {
  label?: string; heading?: string; accentWord?: string; note?: string; steps: Props[]; pad?: string; vis?: string
}) {
  const items = steps.map((s) => ({ title: str(s.title), body: str(s.body) })).filter((s) => s.title || s.body)
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
        {items.map((s, i) => (
          <li key={i}>
            <span className="wh-path-moon"><WhMoon phase={stepPhase(i, items.length)} size={34} /></span>
            <span className="wh-label">{String(i + 1).padStart(2, '0')}</span>
            <h3>{s.title}</h3>
            {s.body && <p>{s.body}</p>}
          </li>
        ))}
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

type SpaceEventLite = { id: string; slug?: string; title: string; startsAt: string; href?: string | null }

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

/** One dated row for a Space event: its date, its moon, its title. */
function SpaceEventRow({ e, metadata }: { e: SpaceEventLite; metadata?: Record<string, unknown> }) {
  const day = parseDay(e.startsAt)
  const when = dateLabel(e.startsAt)
  const href = eventHref(e, metadata)
  const body = (
    <>
      <span className="wh-row-date">{when.day.replace(/^\w+ /, '')}</span>
      <span className="wh-row-mark">{day ? <WhMoon phase={sky(day).phase} size={16} /> : <WhGlyph name="spark" size={14} />}</span>
      <span className="wh-row-text"><span className="wh-row-title">{e.title}</span></span>
    </>
  )
  return href ? <a className="wh-row" href={href}>{body}</a> : <div className="wh-row">{body}</div>
}

// 4e. The season band: the module now (from the block's twelve), the next gathering with its beats, and
//     the next dated days, inside the season's own colours. The dates are the Space's own events.
export function WildheartSeasonBandBlock({ label, heading, accentWord, image, alt, modules, beats, gatheringLabel, gatheringNote, ctaLabel, ctaHref, yearLabel, yearHref, now = new Date(), metadata, pad, vis }: {
  label?: string; heading?: string; accentWord?: string; image?: unknown; alt?: string; modules: Props[]; beats: Props[]; gatheringLabel?: string; gatheringNote?: string
  ctaLabel?: string; ctaHref?: string; yearLabel?: string; yearHref?: string; now?: Date; metadata?: Record<string, unknown>; pad?: string; vis?: string
}) {
  const s = sky(now)
  const mod = modules.map((m) => ({ sign: str(m.sign).toLowerCase(), title: str(m.title), theme: str(m.theme) })).find((m) => m.sign === s.sign)
  const title = mod?.title || `${s.house} · ${s.houseName}`
  const events = upcoming(metadata, now)
  const match = gatheringLabel ? new RegExp(gatheringLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null
  const gathering = match ? events.find((e) => match.test(e.title)) ?? null : null
  const rituals = events.filter((e) => e !== gathering).slice(0, 3)
  const beatRows = beats.map((b) => ({ letter: str(b.letter).toUpperCase(), word: str(b.word) })).filter((b) => b.letter || b.word)
  const cta = hrefOf(str(ctaHref), metadata)
  const year = hrefOf(str(yearHref), metadata)
  const when = gathering ? dateLabel(gathering.startsAt) : null
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
          {mod?.theme && <p>{mod.theme}</p>}
        </article>
        <article className="wh-card wh-card-next">
          <span className="wh-label wh-label-ink">{gathering ? `Next · ${gathering.title}` : 'Next'}</span>
          {when ? <span className="wh-card-date">{when.day.replace(/^\w+ /, '')}</span> : <span className="wh-card-date">Soon</span>}
          {(when?.time || gatheringNote) && <p>{[when?.day.split(' ')[0], when?.time, gatheringNote].filter(Boolean).join(' · ')}</p>}
          {beatRows.length > 0 && (
            <ol className="wh-beats-list">
              {beatRows.map((b, i) => (
                <li key={i}><span className="wh-beat-letter">{b.letter}</span><span className="wh-label">{b.word}</span></li>
              ))}
            </ol>
          )}
          {cta && ctaLabel && <a className="hs-btn hs-btn-soft wh-btn-sm" href={cta}>{ctaLabel}</a>}
        </article>
        <article className="wh-card wh-card-sky">
          <span className="wh-label wh-label-ink">Next dated days</span>
          {rituals.length > 0 ? (
            <ol className="wh-rows">
              {rituals.map((e) => (
                <li key={e.id}><SpaceEventRow e={e} metadata={metadata} /></li>
              ))}
            </ol>
          ) : (
            <p className="wh-journey-empty">A quiet stretch of sky.</p>
          )}
          <span className="wh-card-glyph"><WhGlyph name={s.sign} size={96} /></span>
        </article>
      </div>
    </section>
  )
}

// 4f. The retreat band: a dusk-graded photo with a seal, the dated label with a moon, a display title,
//     three day tiles, two buttons and a note, on smoke and the dusk gradient.
export function WildheartRetreatBandBlock({ label, heading, accentWord, lead, days, ctaLabel, ctaHref, secondaryLabel, secondaryHref, note, image, alt, seal, pad, vis, metadata }: {
  label?: string; heading?: string; accentWord?: string; lead?: string; days: Props[]; ctaLabel?: string; ctaHref?: string; secondaryLabel?: string; secondaryHref?: string
  note?: string; image?: unknown; alt?: string; seal?: string; pad?: string; vis?: string; metadata?: Record<string, unknown>
}) {
  const src = img(image)
  const tiles = days.map((d) => ({ label: str(d.label), title: str(d.title), body: str(d.body), accent: d.accent === true })).filter((d) => d.title || d.label)
  return (
    <section className={cls('wh-block wh-block-retreat', pad, vis)}>
      <div className="wh-retreat">
        {seal && <span className="wh-retreat-watermark" aria-hidden="true"><WhGlyph name={seal} size={460} watermark /></span>}
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
          <Buttons primary={ctaLabel} primaryHref={ctaHref} secondary={secondaryLabel} secondaryHref={secondaryHref} metadata={metadata} />
          {note && <span className="wh-label">{note}</span>}
        </div>
      </div>
    </section>
  )
}

// 4g. The mark split: the Space's own logo (or its name) in a washed card beside a heading, a lead, the
//     ornament, a body and a note card. The About page's shape.
export function WildheartMarkSplitBlock({ label, heading, accentWord, lead, body, note, metadata, pad, vis }: {
  label?: string; heading?: string; accentWord?: string; lead?: string; body?: string; note?: string; metadata?: Record<string, unknown>; pad?: string; vis?: string
}) {
  const space = metadata?.space as { name?: string; logoUrl?: string | null } | undefined
  const logo = safeImageSrc(space?.logoUrl ?? null)
  return (
    <section className={cls('wh-block wh-block-mark', pad, vis)}>
      <div className="wh-mark-split">
        <div className="wh-mark-card">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- the Space's own logo
            <img src={logo} alt={space?.name ?? ''} className="wh-mark-logo" />
          ) : (
            <span className="wh-mark-name">{space?.name ?? ''}</span>
          )}
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

// 4h. The moon strip: a row of moons counting the weeks or seats of something, with its label.
export function WildheartMoonStripBlock({ label, total = 8, done = 0, pad, vis }: { label?: string; total?: number; done?: number; pad?: string; vis?: string }) {
  return (
    <div className={cls('wh-block wh-block-moonstrip', pad, vis)}>
      <WhMoonPhases total={num(total, 8)} done={num(done, 0)} size={14} label={label || undefined} />
    </div>
  )
}

const yearField = { type: 'number', label: 'Year (blank for this year)', min: 1970, max: 2200 } as const
const layoutOf = (layout: unknown) => ({ pad: padClass(layout as LayoutValue), vis: visClass(layout as LayoutValue) })

/** The theme's own twelve module names: the houses, in the order the year walks them from Capricorn. */
const HOUSE_MODULES = [...ZODIAC.slice(9), ...ZODIAC.slice(0, 9)].map((z) => ({ sign: z.id, title: z.houseName, theme: `${z.house} · ${z.name}` }))

export const wildheartComponents: Record<string, ComponentConfig> = {
  WildheartYearJourney: {
    label: 'Year journey (astrology strip)',
    fields: { label: { type: 'text' }, heading: { type: 'textarea' }, lead: { type: 'textarea' }, year: yearField, layout: layoutField },
    defaultProps: {
      label: 'Your year, turning',
      heading: 'Every season has a door.',
      lead: 'Twelve signs, four seasons, every moon. Scroll through the sky and find where you are, and what is coming.',
      year: 0,
      layout: layoutDefault,
    },
    render: ({ label, heading, lead, year, layout, puck }) => (
      <WildheartYearJourneyBlock label={label || undefined} heading={heading || undefined} lead={lead || undefined} year={year} metadata={puck?.metadata} {...layoutOf(layout)} />
    ),
  },
  WildheartSkyMap: {
    label: 'Sky map (astrology wheel)',
    fields: { label: { type: 'text' }, heading: { type: 'textarea' }, lead: { type: 'textarea' }, year: yearField, layout: layoutField },
    defaultProps: {
      label: 'The sky this year',
      heading: 'One wheel. The whole year.',
      lead: 'Festivals, moons and gatherings, placed on the wheel where they fall. Come back to it whenever you need to know where you are.',
      year: 0,
      layout: layoutDefault,
    },
    render: ({ label, heading, lead, year, layout, puck }) => (
      <WildheartSkyMapBlock label={label || undefined} heading={heading || undefined} lead={lead || undefined} year={year} metadata={puck?.metadata} {...layoutOf(layout)} />
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
      steps: { type: 'array', label: 'Steps', arrayFields: { title: { type: 'text', label: 'Title' }, body: { type: 'textarea', label: 'Line' } }, getItemSummary: (item: Props) => str(item.title) || 'Step' },
      layout: layoutField,
    },
    defaultProps: {
      label: 'The path',
      heading: 'Wax at your own pace.',
      accentWord: '',
      note: 'New moon to full',
      steps: [
        { title: 'Visit', body: 'Come once. Watch, or join in.' },
        { title: 'Join', body: 'Take a seat in a circle.' },
        { title: 'Practise', body: 'A short practice you can keep.' },
        { title: 'Gather', body: 'The festivals and every moon.' },
        { title: 'Lead', body: 'Hold a circle of your own.' },
      ],
      layout: layoutDefault,
    },
    render: ({ label, heading, accentWord, note, steps, layout }) => (
      <WildheartMoonPathBlock label={label || undefined} heading={heading || undefined} accentWord={accentWord || undefined} note={note || undefined} steps={arr(steps)} {...layoutOf(layout)} />
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
      modules: { type: 'array', label: 'The twelve modules (one per sign)', arrayFields: { sign: { type: 'select', label: 'Sign', options: ZODIAC.map((z) => ({ label: z.name, value: z.id })) }, title: { type: 'text', label: 'Module' }, theme: { type: 'text', label: 'Theme' } }, getItemSummary: (item: Props) => `${str(item.sign)}: ${str(item.title)}` },
      gatheringLabel: { type: 'text', label: 'The gathering to feature (matched in event titles)' },
      gatheringNote: { type: 'text', label: 'A line under its date' },
      beats: { type: 'array', label: 'Its beats (a letter and a word)', arrayFields: { letter: { type: 'text', label: 'Letter' }, word: { type: 'text', label: 'Word' } }, getItemSummary: (item: Props) => str(item.word) || 'Beat' },
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
      modules: HOUSE_MODULES,
      gatheringLabel: 'Gathering',
      gatheringNote: '',
      beats: [],
      ctaLabel: '',
      ctaHref: '',
      yearLabel: 'See the year',
      yearHref: '',
      layout: layoutDefault,
    },
    render: ({ heading, accentWord, label, image, alt, modules, gatheringLabel, gatheringNote, beats, ctaLabel, ctaHref, yearLabel, yearHref, layout, puck }) => (
      <WildheartSeasonBandBlock heading={heading || undefined} accentWord={accentWord || undefined} label={label || undefined} image={image} alt={alt} modules={arr(modules)} beats={arr(beats)} gatheringLabel={gatheringLabel || undefined} gatheringNote={gatheringNote || undefined} ctaLabel={ctaLabel || undefined} ctaHref={ctaHref || undefined} yearLabel={yearLabel || undefined} yearHref={yearHref || undefined} metadata={puck?.metadata} {...layoutOf(layout)} />
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
    label: 'Moon strip (a count in moons)',
    fields: { label: { type: 'text', label: 'Label' }, total: { type: 'number', label: 'Total', min: 1, max: 24 }, done: { type: 'number', label: 'Done', min: 0, max: 24 }, layout: layoutField },
    defaultProps: { label: 'Eight weeks', total: 8, done: 0, layout: layoutDefault },
    render: ({ label, total, done, layout }) => <WildheartMoonStripBlock label={label || undefined} total={total} done={done} {...layoutOf(layout)} />,
  },
}
