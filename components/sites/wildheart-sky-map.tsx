'use client'

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { addDays, isoDay, parseDay, shortDay, signOf, sky, utcDate, wheelAngle, DAY } from '@/lib/theme/astrology-wheel'
import { WILDHEART_GLYPHS, ZODIAC } from '@/lib/theme/wildheart-symbols'
import { WhConstellation, WhGlyph, WhMoon } from './wildheart-symbols'
import { RangeField } from '@/components/admin/range-field'

// THE SKY MAP (the design handoff's components/calendar/SkyMap.jsx and symbols/ZodiacWheel.jsx, 2026-10-13):
// the click-driven calendar wheel. The wheel turns to the sun's position (900ms, always the short way
// round), the signs stay upright, the centre moon shows the date's phase; the reader taps a sign, steps
// prev / next, spins the year, comes back to today, scrubs the season track, and filters the list by
// scope (this sign, this season, all year) and by group (festivals, moons, Circle Nights, gatherings).
// Two layouts: `centered` (The year page, wheel 440) and `compact` (a phone's Home, wheel 340).
//
// A client island on a Wildheart page only. The sky is computed here from the pure engine
// (lib/theme/astrology-wheel.ts); the dated rows arrive from the server block (the sky's festivals and
// moons plus the Space's own events). Every word is the block's or the sky's; every colour a token.

export type SkyGroup = 'sabbat' | 'moon' | 'circle' | 'gathering'

export interface SkyMapEvent {
  iso: string
  title: string
  note: string
  group: SkyGroup
  /** 0 new or 4 full for a moon. */
  phase?: number
  href?: string | null
}

export interface SkyMapData {
  startIso: string
  endIso: string
  todayIso: string
  events: SkyMapEvent[]
  /** The module each sign carries (the block's twelve), by sign id. */
  modules: Record<string, { title: string; theme: string }>
  labels: {
    groups: Record<SkyGroup, string>
    scopes: { sign: string; season: string; year: string }
    prev: string
    next: string
    spin: string
    pause: string
    today: string
    tap: string
    empty: string
    comingUp: string
    date: string
  }
}

const SIGNS_FROM_CAPRICORN = [...ZODIAC.slice(9), ...ZODIAC.slice(0, 9)].map((z) => z.id)
const TROPICAL = ZODIAC.map((z) => z.id)
const glyphOf = (id: string) => WILDHEART_GLYPHS[id] ?? id
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)

/** The handoff's ZodiacWheel: twelve signs on a ring, the houses inside, the seasons band, ticks, the moon
 *  at the centre and a needle at the top. Rotation turns the rings; the glyphs counter-rotate upright. */
function ZodiacWheel({ selected, onSelect, size, rotation, moonPhase, pointer = true }: { selected: string; onSelect: (id: string) => void; size: number; rotation: number; moonPhase: number; pointer?: boolean }) {
  const [hover, setHover] = useState<string | null>(null)
  const r = size / 2
  const ring = r * 0.74
  const hr = r * 0.4
  const gs = Math.round(size * 0.072)
  const pos = (i: number, rad: number, d: number) => {
    const a = ((i + 0.5) / 12) * Math.PI * 2 - Math.PI / 2
    return { left: r + Math.cos(a) * rad - d / 2, top: r + Math.sin(a) * rad - d / 2 }
  }
  const segIdx = { winter: 0, spring: 1, summer: 2, fall: 3 }[skyOfSign(selected)]
  const counter = { transform: `rotate(${-rotation}deg)` }
  return (
    <div className="wh-zw" style={{ width: size, height: size }}>
      <div className="wh-zw-ground" />
      <div className="wh-zw-clip">
        <div className="wh-zw-turn" style={{ transform: `rotate(${rotation}deg)` }}>
          <div className="wh-zw-seasons" />
          <div className="wh-zw-season-now" style={{ ['--wh-zw-from' as string]: `${segIdx * 90}deg` }} data-season={SEASON_OF_IDX[segIdx]} />
          <div className="wh-zw-ticks" />
          <div className="wh-zw-ticks-major" />
          <div className="wh-zw-ring" style={{ inset: size * 0.045 }} />
          <div className="wh-zw-ring" style={{ inset: size * 0.255 }} />
          <div className="wh-zw-ring-dotted" style={{ inset: size * 0.275 }} />
          <div className="wh-zw-spokes" />
          {SIGNS_FROM_CAPRICORN.map((sg, i) => {
            const z = ZODIAC.find((x) => x.id === sg)!
            const d = size * 0.1
            return (
              <span key={`h${sg}`} className="wh-zw-house" data-on={sg === selected ? '' : undefined} style={{ ...pos(i, hr, d), width: d, height: d, fontSize: Math.max(9, size * 0.042), ...counter }}>
                {z.house}
              </span>
            )
          })}
          {SIGNS_FROM_CAPRICORN.map((s, i) => {
            const on = s === selected
            const d = gs * 1.9
            return (
              <button
                key={s}
                type="button"
                title={cap(s)}
                aria-label={cap(s)}
                aria-pressed={on}
                onClick={() => onSelect(s)}
                onMouseEnter={() => setHover(s)}
                onMouseLeave={() => setHover(null)}
                className="wh-zw-sign"
                data-on={on ? '' : undefined}
                data-hover={hover === s && !on ? '' : undefined}
                style={{ ...pos(i, ring, d), width: d, height: d, fontSize: gs, transform: `rotate(${-rotation}deg) scale(${on ? 1.08 : 1})` }}
              >
                {glyphOf(s)}
              </button>
            )
          })}
        </div>
      </div>
      <div className="wh-zw-moon"><WhMoon phase={moonPhase} size={size * 0.24} /></div>
      {pointer && (
        <div aria-hidden="true" className="wh-zw-needle" style={{ top: -size * 0.035 }}>
          <span className="wh-zw-needle-cap" />
          <span className="wh-zw-needle-line" style={{ height: size * 0.06 }} />
        </div>
      )}
    </div>
  )
}

const SEASON_OF_IDX = ['winter', 'spring', 'summer', 'fall'] as const
const SIGN_SEASON: Record<string, (typeof SEASON_OF_IDX)[number]> = { capricorn: 'winter', aquarius: 'winter', pisces: 'winter', aries: 'spring', taurus: 'spring', gemini: 'spring', cancer: 'summer', leo: 'summer', virgo: 'summer', libra: 'fall', scorpio: 'fall', sagittarius: 'fall' }
const skyOfSign = (id: string) => SIGN_SEASON[id] ?? 'winter'

/** One dated row (the handoff's EventRow): date, mark, title, note. */
function EventRow({ e, active, onClick }: { e: SkyMapEvent; active: boolean; onClick: () => void }) {
  const d = parseDay(e.iso)
  const es = d ? sky(d) : null
  const mark =
    e.group === 'moon' ? <WhMoon phase={e.phase ?? 4} size={16} /> : e.group === 'sabbat' ? <WhGlyph name="star" size={15} /> : e.group === 'circle' && es ? <WhGlyph name={es.sign} size={15} /> : <span className="wh-seed" data-season={es?.season} aria-hidden="true" />
  return (
    <button type="button" className="wh-row" aria-current={active ? 'date' : undefined} onClick={onClick}>
      <span className="wh-row-date">{d ? shortDay(d) : e.iso}</span>
      <span className="wh-row-mark">{mark}</span>
      <span className="wh-row-text">
        <span className="wh-row-title">{e.title}</span>
        {e.note && <span className="wh-row-note">{e.note}</span>}
      </span>
    </button>
  )
}

/** The scrubbable year track (the handoff's SeasonTrack): a season-coloured rail, the festivals as stars
 *  and the moons as dots along it, a range input over it, the quarter months under it. */
function SeasonTrack({ start, end, value, events, onChange }: { start: Date; end: Date; value: Date; events: SkyMapEvent[]; onChange: (d: Date) => void }) {
  const span = Math.round((end.getTime() - start.getTime()) / DAY)
  const pct = (d: Date) => `${((d.getTime() - start.getTime()) / DAY / span) * 100}%`
  const stops: string[] = []
  for (let i = 0; i <= span; i += 7) stops.push(`var(--wh-season-${sky(addDays(start, i)).season}) ${((i / span) * 100).toFixed(1)}%`)
  const months: Date[] = []
  for (let d = utcDate(start.getUTCFullYear(), start.getUTCMonth() + 1, 1); d.getTime() <= end.getTime(); d = utcDate(d.getUTCFullYear(), d.getUTCMonth() + 2, 1)) {
    if (d.getTime() >= start.getTime() && (d.getUTCMonth() % 3 === 0 || months.length === 0)) months.push(d)
  }
  const val = Math.round((value.getTime() - start.getTime()) / DAY)
  return (
    <div className="wh-track">
      <div className="wh-track-rail" style={{ background: `linear-gradient(90deg,${stops.join(',')})` }} />
      {events
        .filter((e) => e.group === 'sabbat' || e.group === 'moon')
        .map((e, i) => {
          const d = parseDay(e.iso)
          if (!d) return null
          return e.group === 'sabbat' ? (
            <span key={i} className="wh-track-star" style={{ left: pct(d) }}>{glyphOf('star')}</span>
          ) : (
            <span key={i} className="wh-track-moon" data-new={e.phase === 0 ? '' : undefined} style={{ left: pct(d) }} />
          )
        })}
      <RangeField bare className="wh-track-range" min={0} max={span} value={Math.max(0, Math.min(span, val))} onChange={(v) => onChange(addDays(start, v))} aria-label="Date" />
      <div className="wh-track-months">
        {months.map((m, i) => (
          <span key={i} className="wh-label" style={{ left: pct(m), transform: i === 0 ? 'none' : 'translateX(-50%)' }}>
            {shortDay(m).split(' ')[0]}
            {m.getUTCMonth() === 0 || i === 0 ? ` ${String(m.getUTCFullYear()).slice(2)}` : ''}
          </span>
        ))}
      </div>
    </div>
  )
}

export function WildheartSkyMap({ data, layout = 'centered', wheelSize = 440 }: { data: SkyMapData; layout?: 'centered' | 'compact'; wheelSize?: number }) {
  const rootRef = useRef<HTMLDivElement>(null)
  // Before the island measures itself (the server render, a page without script) the width is the
  // handoff's: The year's 1120px column, or a phone's 342px column.
  const [cw, setCw] = useState(layout === 'compact' ? 342 : 1120)
  useEffect(() => {
    const el = rootRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setCw(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const start = useMemo(() => parseDay(data.startIso) ?? utcDate(2027, 1, 1), [data.startIso])
  const end = useMemo(() => parseDay(data.endIso) ?? utcDate(2027, 12, 31), [data.endIso])
  const today = useMemo(() => parseDay(data.todayIso) ?? start, [data.todayIso, start])
  const all = useMemo(() => [...data.events].sort((a, b) => a.iso.localeCompare(b.iso)), [data.events])
  const [date, setDate] = useState(today)
  const [groups, setGroups] = useState<Record<SkyGroup, boolean>>({ sabbat: true, moon: true, circle: true, gathering: true })
  const [scope, setScope] = useState<'sign' | 'season' | 'year'>('sign')
  const [play, setPlay] = useState(false)
  const s = sky(date)
  const mod = data.modules[s.sign] ?? { title: `${s.house} · ${s.houseName}`, theme: s.seasonTheme }
  const [a, b] = s.range
  const target = -wheelAngle(date)
  // The rotation unwinds the short way round from wherever the wheel last rested: derived from the date
  // during render (React's own pattern for state that follows a prop), never from an effect.
  const [turn, setTurn] = useState({ target, rot: target })
  if (turn.target !== target) {
    const p = turn.rot
    const rot = Number.isFinite(p) ? p + ((((target - p) % 360) + 540) % 360) - 180 : target
    setTurn({ target, rot })
  }
  const rot = turn.rot
  useEffect(() => {
    if (!play) return
    const id = setInterval(
      () =>
        setDate((d) => {
          const n = addDays(d, 2)
          return n.getTime() > end.getTime() ? start : n
        }),
      90,
    )
    return () => clearInterval(id)
  }, [play, start, end])
  const dateOf = (e: SkyMapEvent) => parseDay(e.iso)!
  const inScope = (e: SkyMapEvent) => {
    const d = dateOf(e)
    if (scope === 'sign') return d.getTime() >= a.getTime() && d.getTime() <= b.getTime()
    if (scope === 'season') return sky(d).season === s.season && Math.abs(d.getTime() - date.getTime()) < 120 * DAY
    return true
  }
  const list = all.filter((e) => groups[e.group] && inScope(e))
  const goSign = (sg: string) => {
    let best: number | null = null
    for (let i = -200; i <= 200; i++) {
      const d = addDays(date, i)
      if (d.getTime() < start.getTime() || d.getTime() > end.getTime()) continue
      if (signOf(d) === sg && (best === null || Math.abs(i) < Math.abs(best))) best = i
    }
    if (best !== null) setDate(addDays(date, best))
  }
  const prevSign = () => goSign(TROPICAL[(TROPICAL.indexOf(s.sign) + 11) % 12])
  const nextSign = () => goSign(TROPICAL[(TROPICAL.indexOf(s.sign) + 1) % 12])
  const isToday = (e: SkyMapEvent) => Math.abs(dateOf(e).getTime() - date.getTime()) < DAY / 2
  const L = data.labels
  const groupChips = (
    <div className="wh-sm-chips">
      {(['sabbat', 'moon', 'circle', 'gathering'] as SkyGroup[]).map((k) => (
        <button key={k} type="button" className="wh-chip" aria-pressed={groups[k]} onClick={() => setGroups((t) => ({ ...t, [k]: !t[k] }))}>
          {L.groups[k]}
        </button>
      ))}
    </div>
  )
  const scopes = (
    <div className="wh-sm-scopes">
      {(['sign', 'season', 'year'] as const).map((k) => (
        <button key={k} type="button" className="wh-sm-prompt" aria-pressed={scope === k} onClick={() => setScope(k)}>
          {L.scopes[k]}
        </button>
      ))}
    </div>
  )
  const sep = <span className="wh-sm-sep" aria-hidden="true" />

  if (layout === 'compact') {
    const ws = Math.round(Math.min(cw - 8, wheelSize))
    const soon = all.filter((e) => dateOf(e).getTime() >= date.getTime()).slice(0, 3)
    return (
      <div ref={rootRef} className="wh-sm wh-sm-compact" data-season={s.season}>
        <div className="wh-sm-line">
          <span className="wh-label wh-label-ink">{shortDay(date)} · {s.phaseName}</span>
          <WhMoon phase={s.phase} size={14} />
        </div>
        <ZodiacWheel selected={s.sign} onSelect={goSign} size={ws} rotation={rot} moonPhase={s.phase} />
        <div className="wh-sm-big">
          <button type="button" aria-label="Previous sign" className="wh-sm-big-btn" onClick={prevSign}>‹ {L.prev}</button>
          <button type="button" className="wh-sm-big-btn wh-sm-big-primary" onClick={() => setDate(today)}>{L.today}</button>
          <button type="button" aria-label="Next sign" className="wh-sm-big-btn" onClick={nextSign}>{L.next} ›</button>
        </div>
        <div className="wh-sm-now">
          <div className="wh-sm-line"><WhGlyph name={s.sign} size={16} /><span className="wh-label wh-label-season">{s.seasonName} · {s.house} {s.houseName}</span></div>
          <div className="wh-sm-module">{mod.title}</div>
          <div className="wh-sm-theme">{mod.theme}.</div>
        </div>
        <div className="wh-sm-soon">
          <span className="wh-label">{L.comingUp}</span>
          {soon.map((e, i) => (
            <EventRow key={i} e={e} active={isToday(e)} onClick={() => setDate(dateOf(e))} />
          ))}
        </div>
      </div>
    )
  }

  const stack = cw < 1100
  const ws = Math.round(Math.min(wheelSize, stack ? Math.min(cw * 0.8, wheelSize) : cw * 0.36))
  return (
    <div ref={rootRef} className="wh-sm wh-sm-centered" data-season={s.season} data-stack={stack ? '' : undefined}>
      <div className="wh-sm-grid">
        <div className="wh-sm-info">
          <span className="wh-label">{shortDay(date)} {date.getUTCFullYear()}</span>
          <div className="wh-sm-line"><span className="wh-label wh-label-season">{s.seasonName} · {s.seasonTheme} · {s.house}</span><WhGlyph name={s.sign} size={18} /></div>
          <div className="wh-sm-module">{mod.title}</div>
          <div className="wh-sm-theme">{mod.theme}.</div>
          <span className="wh-label">{shortDay(a)} – {shortDay(b)} · {s.houseName}</span>
          <div className="wh-sm-line wh-sm-moonline"><span className="wh-label wh-label-ink">{s.phaseName}</span><WhMoon phase={s.phase} size={16} /></div>
          <div className="wh-sm-constellation"><WhConstellation sign={s.sign} size={110} /></div>
        </div>
        <div className="wh-sm-wheel">
          <ZodiacWheel selected={s.sign} onSelect={goSign} size={ws} rotation={rot} moonPhase={s.phase} />
          <div className="wh-sm-controls">
            <button type="button" className="wh-sm-prompt" onClick={() => { setPlay(false); prevSign() }}>‹ {L.prev}</button>
            {sep}
            <button type="button" className="wh-sm-prompt" aria-pressed={play} onClick={() => setPlay((p) => !p)}>{play ? L.pause : L.spin}</button>
            {sep}
            <button type="button" className="wh-sm-prompt" onClick={() => { setPlay(false); setDate(today) }}>{L.today}</button>
            {sep}
            <button type="button" className="wh-sm-prompt" onClick={() => { setPlay(false); nextSign() }}>{L.next} ›</button>
          </div>
          <span className="wh-sm-tap">{L.tap}</span>
        </div>
        <div className="wh-sm-events">
          {scopes}
          <div className="wh-sm-list">
            {list.length === 0 && <div className="wh-sm-empty">{L.empty}</div>}
            {list.map((e, i) => (
              <Fragment key={i}>
                <EventRow e={e} active={isToday(e)} onClick={() => { setPlay(false); setDate(dateOf(e)) }} />
              </Fragment>
            ))}
          </div>
          {groupChips}
        </div>
      </div>
      <div className="wh-sm-track">
        <SeasonTrack start={start} end={end} value={date} events={all} onChange={(d) => { setPlay(false); setDate(d) }} />
      </div>
      <span className="sr-only">{isoDay(date)}</span>
    </div>
  )
}
