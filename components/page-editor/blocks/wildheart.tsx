import type { ComponentConfig } from '@/lib/page-editor/types'
import { layoutField, layoutDefault, padClass, visClass, type LayoutValue } from '@/lib/page-editor/layout'
import {
  astrologyWheel,
  eventItems,
  isoDay,
  shortDay,
  sky,
  skyItems,
  utcDate,
  type WheelItem,
  type WheelModel,
} from '@/lib/theme/astrology-wheel'
import { moonPhasePath } from '@/lib/theme/wildheart-symbols'
import { WildheartNowLine } from '@/components/sites/wildheart-now-line'
import { WhGlyph, WhMoon } from '@/components/sites/wildheart-symbols'

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
      {label && <span className="wh-label">{label}</span>}
      {heading && <h2>{heading}</h2>}
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

const yearField = { type: 'number', label: 'Year (blank for this year)', min: 1970, max: 2200 } as const

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
      <WildheartYearJourneyBlock label={label || undefined} heading={heading || undefined} lead={lead || undefined} year={year} metadata={puck?.metadata} pad={padClass(layout as LayoutValue)} vis={visClass(layout as LayoutValue)} />
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
      <WildheartSkyMapBlock label={label || undefined} heading={heading || undefined} lead={lead || undefined} year={year} metadata={puck?.metadata} pad={padClass(layout as LayoutValue)} vis={visClass(layout as LayoutValue)} />
    ),
  },
  WildheartNowLine: {
    label: 'Date line (today in the sky)',
    fields: { layout: layoutField },
    defaultProps: { layout: layoutDefault },
    render: ({ layout }) => <WildheartNowLineBlock pad={padClass(layout as LayoutValue)} vis={visClass(layout as LayoutValue)} />,
  },
}
