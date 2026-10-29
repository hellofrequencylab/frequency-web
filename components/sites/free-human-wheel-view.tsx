'use client'

/* eslint-disable react-hooks/refs, react-hooks/purity -- the wheel is an imperative engine: its frame loop, drag and scroll handlers read the latest state
   through refs mirrored each render (the same latest-ref pattern the admin bar uses), and the day under the needle is held in a ref so a
   frame does not re-render the page. Nothing here reads a ref to decide what the server renders. */

import { memo, useCallback, useEffect, useMemo, useReducer, useRef, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { FreeHumanMoon } from '@/components/sites/free-human-moon'
import {
  FREE_HUMAN_MONTH_LONG, FREE_HUMAN_MONTH_SHORT, FREE_HUMAN_SEASON_NAME, FREE_HUMAN_SIGN_GLYPH, FREE_HUMAN_TEXT_MARK, FREE_HUMAN_WHEEL_LAYERS, FREE_HUMAN_WHEEL_YEARS,
  freeHumanWheelCap as cap, freeHumanWheelContext, freeHumanWheelDate, freeHumanWheelKindLabel, freeHumanWheelMonth, freeHumanWheelMonthDay, freeHumanWheelPhaseName,
  freeHumanWheelSeasonOf, freeHumanWheelStops, freeHumanWheelYear,
  type FreeHumanSeasonId, type FreeHumanWheelEvent, type FreeHumanWheelGathering, type FreeHumanWheelKind, type FreeHumanWheelStop, type FreeHumanWheelYear,
} from '@/lib/sites/free-human-wheel'

// THE FREE HUMAN YEAR WHEEL (design: templates/website/YearWheel.dc.html). The wheel turns under a fixed needle: twelve signs, the
// four turns and four festivals, every full and new moon, the eclipses, Mercury's retrograde and the Space's own gatherings. Turn
// it by hand (drag, the arrows, the thread below, the keys) or let the page scroll turn it. The sky itself comes from
// lib/sites/free-human-wheel.ts; this file is only the drawing and the turning. Colours are the theme's tokens, the classes are
// in components/sites/free-human-wheel-css.ts.

const HOLD = 0.2
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x))
const ss = (t: number) => t * t * (3 - 2 * t)
const invSS = (u: number) => { let lo = 0, hi = 1; for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; if (ss(m) < u) lo = m; else hi = m } return (lo + hi) / 2 }
const P = (r: number, a: number): [number, number] => { const t = ((a - 90) * Math.PI) / 180; return [50 + r * Math.cos(t), 50 + r * Math.sin(t)] }
const arc = (r: number, a0: number, a1: number) => { const [x0, y0] = P(r, a0); const [x1, y1] = P(r, a1); return `M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}` }
const wedge = (r0: number, r1: number, a0: number, a1: number) => {
  const [x0, y0] = P(r1, a0); const [x1, y1] = P(r1, a1); const [x2, y2] = P(r0, a1); const [x3, y3] = P(r0, a0)
  const L = a1 - a0 > 180 ? 1 : 0
  return `M${x0} ${y0}A${r1} ${r1} 0 ${L} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${L} 0 ${x3} ${y3}Z`
}
const RADIUS: Record<FreeHumanWheelKind, number> = { gathering: 28.6, month: 46.6, ingress: 44.4, season: 34, festival: 34, full: 26, new: 26, eclipse: 26, retro: 23.4, direct: 23.4 }
const INK = 'var(--symbol-ink)'
const SOFT = 'var(--symbol-line-soft)'
const LINE = 'var(--symbol-line)'
const SEASON_FILL: Record<FreeHumanSeasonId, string> = { winter: 'var(--season-winter)', spring: 'var(--season-spring)', summer: 'var(--season-summer)', fall: 'var(--season-fall)' }
const PERCENT = (n: number) => `${n}%`

type Mode = 'click' | 'scroll'
interface Pin { i: number; kind: FreeHumanWheelKind; title: string; sub: string; text: string; label?: string; href?: string }
interface State { year: number; mode: Mode; filters: Record<string, boolean>; di: number; act: number; hover: number; wide: boolean; stageH: number; headH: number; stuck: boolean; flash: boolean; pin: Pin | null }

// ── The wheel ──────────────────────────────────────────────────────────────────────────────────

interface Go { event: (e: FreeHumanWheelEvent) => void; sign: (s: string) => void; season: (s: FreeHumanSeasonId) => void; month: (m: number) => void }

/** Everything that turns: the season and sign bands, the ticks, the names, the marks. Memoised on the year, the layer filter and
 *  the sign, so it is drawn once per change and the turning is only a transform. */
const WheelBase = memo(function WheelBase({ Y, evs, retro, go, uid }: { Y: FreeHumanWheelYear; evs: FreeHumanWheelEvent[]; retro: boolean; go: Go; uid: string }) {
  const A = (i: number) => (i / Y.n) * 360
  const defs: ReactNode[] = []
  const curved = (id: string, r: number, a0: number, a1: number, text: string, cls: string, style?: CSSProperties) => {
    const key = `${uid}${id}`
    defs.push(<path key={key} id={key} d={arc(r, a0, a1)} fill="none" />)
    return <text key={`t${key}`} className={cls} style={style} dominantBaseline="middle"><textPath href={`#${key}`} startOffset="50%" textAnchor="middle">{text}</textPath></text>
  }
  const k: ReactNode[] = []
  Y.seasons.forEach(([s, a0, a1]) => k.push(<path key={`sw${s}`} className="fhw-season" data-s={s} d={wedge(28.6, 34.2, a0, a1)} style={{ fill: SEASON_FILL[s] }} onClick={() => go.season(s)}><title>{FREE_HUMAN_SEASON_NAME[s]}</title></path>))
  ;([[48.9, 0.3], [44.4, 0.3], [34.2, 0.35], [33.7, 0.12], [28.6, 0.3]] as const).forEach(([r, w]) => k.push(<circle key={`c${r}`} cx={50} cy={50} r={r} fill="none" style={{ stroke: INK, strokeWidth: w }} />))
  for (let i = 0; i < Y.n; i++) {
    const a = A(i)
    const long = Y.days[i].d % 5 === 0
    const [x0, y0] = P(48.9, a)
    const [x1, y1] = P(long ? 48 : 48.45, a)
    k.push(<line key={`t${i}`} x1={x0} y1={y0} x2={x1} y2={y1} style={{ stroke: SOFT, strokeWidth: long ? 0.16 : 0.1 }} />)
  }
  Y.monthStart.forEach((i, m) => {
    const a = A(i)
    const a1 = m < 11 ? A(Y.monthStart[m + 1]) : 360
    const [x0, y0] = P(48.9, a)
    const [x1, y1] = P(44.4, a)
    k.push(
      <g key={`m${m}`} onClick={() => go.month(m)} className="fhw-click">
        <title>{FREE_HUMAN_MONTH_LONG[m]}</title>
        <path className="yw-hit" d={wedge(44.4, 48.9, a, a1)} />
        <line x1={x0} y1={y0} x2={x1} y2={y1} style={{ stroke: LINE, strokeWidth: 0.22 }} />
      </g>,
    )
    k.push(curved(`m${m}`, 46.1, a, a1, FREE_HUMAN_MONTH_LONG[m], 'fhw-month-name'))
  })
  Y.segs.forEach((s, j) => {
    const [x0, y0] = P(44.4, s.a0)
    const [x1, y1] = P(34.2, s.a0)
    const mid = (s.a0 + s.a1) / 2
    k.push(
      <g key={`s${j}`} onClick={() => go.sign(s.sign)} className="fhw-click">
        <title>{cap(s.sign)}</title>
        <path className="yw-hit" d={wedge(34.2, 44.4, s.a0, s.a1)} />
        <line x1={x0} y1={y0} x2={x1} y2={y1} style={{ stroke: INK, strokeWidth: 0.3 }} />
        <g transform={`rotate(${mid} 50 50)`}><text x={50} y={9.2} textAnchor="middle" dominantBaseline="middle" className="fhw-sign-glyph">{FREE_HUMAN_SIGN_GLYPH[s.sign] + FREE_HUMAN_TEXT_MARK}</text></g>
      </g>,
    )
    k.push(curved(`s${j}`, 36.4, s.a0, s.a1, cap(s.sign), 'fhw-sign-name', undefined))
  })
  Y.seasons.forEach(([s, a0, a1]) => k.push(curved(`z${s}`, 31.4, a0, a1, FREE_HUMAN_SEASON_NAME[s].toUpperCase(), 'fhw-season-name', { fill: `var(--season-${s}-ink)` })))
  if (retro) {
    Y.arcs.forEach(([s, e], j) => k.push(
      <path key={`rx${j}`} className="fhw-retro-arc fhw-click" d={arc(23.4, A(s), A(e))} fill="none" onClick={() => { const hit = evs.find((x) => x.kind === 'retro' && x.i === s); if (hit) go.event(hit) }}><title>Mercury retrograde</title></path>,
    ))
  }
  evs.forEach((e, j) => {
    if (e.kind === 'ingress') return
    const [x, y] = P(RADIUS[e.kind], A(e.i))
    let mark: ReactNode
    if (e.kind === 'season' || e.kind === 'festival') mark = (<><circle cx={x} cy={y} r={1.55} className="fhw-m-card" style={{ stroke: INK }} /><text x={x} y={y + 0.1} textAnchor="middle" dominantBaseline="middle" className="fhw-m-star">{`✶${FREE_HUMAN_TEXT_MARK}`}</text></>)
    else if (e.kind === 'gathering') mark = (<><circle cx={x} cy={y} r={1.25} className="fhw-m-card" style={{ stroke: 'var(--fill-secondary)', strokeWidth: 0.25 }} /><circle cx={x} cy={y} r={0.85} style={{ fill: 'var(--fill-primary)' }} /></>)
    else if (e.kind === 'full') mark = <circle cx={x} cy={y} r={0.85} className="fhw-m-card" style={{ stroke: INK }} />
    else if (e.kind === 'new') mark = <circle cx={x} cy={y} r={0.8} style={{ fill: 'var(--text-witch)' }} />
    else if (e.kind === 'eclipse') mark = (<><circle cx={x} cy={y} r={0.95} style={{ fill: 'var(--fill-secondary)' }} /><circle cx={x} cy={y} r={1.6} style={{ fill: 'none', stroke: 'var(--fill-secondary)', strokeWidth: 0.18 }} /></>)
    else mark = <circle cx={x} cy={y} r={0.5} style={{ fill: 'var(--fill-secondary)' }} />
    k.push(
      <g key={`e${j}`} className="fhw-click" onClick={() => go.event(e)}>
        <title>{`${e.title} · ${freeHumanWheelDate(Y.y, e.i)}`}</title>
        <circle cx={x} cy={y} r={2.2} className="yw-hit" />
        {mark}
      </g>,
    )
  })
  return <svg viewBox="0 0 100 100" width="100%" height="100%" className="fhw-svg"><defs>{defs}</defs>{k}</svg>
})

/** The wash under the wheel: the current season's band and the current sign's wedge, and the ring on the active or hovered stop. */
function WheelLayer({ Y, sign, kind, stop }: { Y: FreeHumanWheelYear; sign: string; kind: 'under' | 'over'; stop?: FreeHumanWheelStop | null }) {
  const A = (i: number) => (i / Y.n) * 360
  if (kind === 'under') {
    const season = freeHumanWheelSeasonOf(sign)
    return (
      <svg viewBox="0 0 100 100" width="100%" height="100%" className="fhw-svg fhw-under" aria-hidden="true">
        {Y.seasons.filter((z) => z[0] === season).map(([s, a0, a1]) => <path key={s} d={wedge(28.6, 34.2, a0, a1)} style={{ fill: SEASON_FILL[s], opacity: 0.25 }} />)}
        {Y.segs.filter((s) => s.sign === sign).map((s, j) => <path key={j} d={wedge(34.2, 44.4, s.a0, s.a1)} style={{ fill: 'color-mix(in srgb,var(--fill-primary) 22%,transparent)' }} />)}
      </svg>
    )
  }
  if (!stop) return null
  const e = stop.items[0]
  const [x, y] = P(RADIUS[e.kind] || 30, A(stop.i))
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" className="fhw-svg fhw-over" aria-hidden="true">
      <circle cx={x} cy={y} r={e.kind === 'ingress' || e.kind === 'month' ? 1.6 : 2.6} className="fhw-ring" />
    </svg>
  )
}

function Frame() {
  const ring = (r: number, w: number) => <circle cx={50} cy={50} r={r} style={{ fill: 'none', stroke: INK, strokeWidth: w }} />
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" className="fhw-svg">
      {ring(49.7, 0.4)}{ring(49.15, 0.12)}{ring(21.6, 0.35)}{ring(21, 0.12)}
      <line x1={50} y1={-0.6} x2={50} y2={28.4} style={{ stroke: 'var(--fill-primary)', strokeWidth: 0.3 }} />
      <path d="M48.4 -3.6 L51.6 -3.6 L50 -.4 Z" style={{ fill: 'var(--fill-primary)' }} />
      {[45, 135, 225, 315].map((a) => { const [x, y] = P(51.4, a); return <circle key={a} cx={x} cy={y} r={0.35} style={{ fill: INK, opacity: 0.6 }} /> })}
    </svg>
  )
}

/** A kind's small mark in the legend and on the thread. */
function KindDot({ kind, size = 9, faded }: { kind: FreeHumanWheelKind; size?: number; faded?: boolean }) {
  const star = kind === 'season' || kind === 'festival'
  return <span className="fhw-dot" data-kind={kind} style={{ '--fhw-dot': `${size}px`, opacity: faded ? 0.3 : 1 } as CSSProperties} aria-hidden="true">{star ? `✶${FREE_HUMAN_TEXT_MARK}` : ''}</span>
}

// ── The view ───────────────────────────────────────────────────────────────────────────────────

export interface FreeHumanWheelViewProps {
  /** "YYYY-MM-DD", the day the page was drawn. */
  today: string
  gatherings: FreeHumanWheelGathering[]
  defaultMode: Mode
  /** Viewport height each stop gets in scroll mode, in vh. */
  stepHeight: number
  /** The sticky header's height, so the stage sits under it. */
  stickOffset: number
  eyebrow: ReactNode
  title: ReactNode
  /** Where "See it in the calendar" goes. */
  calendarHref: string
}

const uidOf = (y: number) => `yw${y}`

export function FreeHumanWheelView({ today, gatherings, defaultMode, stepHeight, stickOffset, eyebrow, title, calendarHref }: FreeHumanWheelViewProps) {
  const years = FREE_HUMAN_WHEEL_YEARS
  const todayYear = Number(today.slice(0, 4))
  const startYear = (years as readonly number[]).includes(todayYear) ? todayYear : todayYear > years[years.length - 1] ? years[years.length - 1] : years[0]
  const cache = useRef(new Map<number, FreeHumanWheelYear>())
  const yearOf = useCallback((y: number) => { let v = cache.current.get(y); if (!v) { v = freeHumanWheelYear(y); cache.current.set(y, v) } return v }, [])
  const todayIdxFor = useCallback((y: number, Y: FreeHumanWheelYear) => {
    if (todayYear !== y) return -1
    const [yy, mm, dd] = today.split('-').map(Number)
    return clamp(Math.round((Date.UTC(yy, mm - 1, dd) - Date.UTC(y, 0, 1)) / 864e5), 0, Y.n - 1)
  }, [today, todayYear])

  const [s, set] = useReducer((a: State, b: Partial<State>) => ({ ...a, ...b }), undefined, (): State => {
    const filters = { sun: true, seasons: true, full: true, new: true, eclipses: true, retro: true, ours: true }
    const Y0 = yearOf(startYear)
    const stops0 = freeHumanWheelStops(Y0, gatherings, filters).stops
    const t0 = todayIdxFor(startYear, Y0)
    const day0 = t0 >= 0 ? t0 : stops0[0]?.i ?? 0
    let act0 = 0
    stops0.forEach((x, j) => { if (Math.abs(x.i - day0) < Math.abs(stops0[act0].i - day0)) act0 = j })
    return { year: startYear, mode: 'click', filters, di: day0, act: act0, hover: -1, wide: false, stageH: 900, headH: 100, stuck: false, flash: false, pin: null }
  })
  const st = useRef(s)
  st.current = s

  const Y = yearOf(s.year)
  const D = useMemo(() => ({ Y, ...freeHumanWheelStops(Y, gatherings, s.filters) }), [Y, gatherings, s.filters])
  const dRef = useRef(D)
  dRef.current = D
  const t = todayIdxFor(s.year, Y)

  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const faceRef = useRef<HTMLDivElement>(null)
  const rotorRef = useRef<HTMLDivElement>(null)
  const markerRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLSpanElement>(null)
  const headRef = useRef<HTMLHeadingElement>(null)
  const c = useRef({ day: 0, target: 0, applied: -1 })
  const m = useRef({ drag: null as null | { a: number; day: number; moved: number; id: number; cap?: boolean }, suppress: false, noAuto: false, switching: false, reduce: false, last: 0, flashCount: 0, pinArrived: false, lastSet: 0 })
  const timers = useRef<{ flash?: ReturnType<typeof setTimeout>; di?: ReturnType<typeof setTimeout> }>({})

  // the first day shown: today when this year holds it, else the first stop
  const startDay = t >= 0 ? t : D.stops[0]?.i ?? 0
  const started = useRef(false)
  if (!started.current) { started.current = true; c.current.day = c.current.target = startDay; c.current.applied = -1 }

  const nearest = useCallback((day: number) => { const stops = dRef.current.stops; let k = 0, b = Infinity; stops.forEach((x, j) => { const d = Math.abs(x.i - day); if (d < b) { b = d; k = j } }); return k }, [])
  const scrollStops = () => dRef.current.stops
  const dayAtP = (p: number) => {
    const stops = scrollStops()
    if (stops.length < 2) return stops[0]?.i ?? 0
    const x = clamp(p) * (stops.length - 1)
    const i = Math.min(stops.length - 2, Math.floor(x))
    const u = x - i
    return stops[i].i + (stops[i + 1].i - stops[i].i) * ss(clamp((u - HOLD) / (1 - 2 * HOLD)))
  }
  const pAt = (day: number) => {
    const stops = scrollStops()
    if (stops.length < 2) return 0
    day = clamp(day, stops[0].i, stops[stops.length - 1].i)
    let i = 0
    while (i < stops.length - 2 && day > stops[i + 1].i) i++
    const a = stops[i].i, b = stops[i + 1].i, u = b > a ? (day - a) / (b - a) : 0
    const tt = u <= 0 ? 0 : u >= 1 ? 1 : HOLD + (1 - 2 * HOLD) * invSS(u)
    return (i + tt) / (stops.length - 1)
  }
  const stickTop = () => stickOffset - Math.max(0, Math.min(st.current.headH, st.current.stageH - window.innerHeight))
  const range = () => { const r = rootRef.current, g = stageRef.current; return r && g ? Math.max(1, r.offsetHeight - g.offsetHeight) : 1 }
  const scrollToDay = (day: number, smooth: boolean) => { const r = rootRef.current; if (!r) return; window.scrollTo({ top: window.scrollY + r.getBoundingClientRect().top - stickTop() + pAt(day) * range(), behavior: smooth ? 'smooth' : 'instant' }) }
  const goDay = (i: number) => { if (st.current.mode === 'scroll') scrollToDay(i, true); else c.current.target = i }
  const goStop = (k: number) => { if (st.current.pin) set({ pin: null }); const stops = dRef.current.stops; if (stops.length) goDay(stops[clamp(k, 0, stops.length - 1)].i) }
  const refDay = () => (st.current.mode === 'scroll' ? c.current.day : c.current.target)
  const step = (dir: number) => {
    if (st.current.pin) set({ pin: null })
    const stops = dRef.current.stops
    const d = refDay()
    let k = -1
    if (dir > 0) k = stops.findIndex((x) => x.i > d + 0.5)
    else stops.forEach((x, j) => { if (x.i < d - 0.5) k = j })
    if (k >= 0) goStop(k)
  }
  const goEvent = (e: FreeHumanWheelEvent) => { m.current.pinArrived = false; set({ pin: e }); goDay(e.i) }
  const go = useRef<Go>({ event: () => {}, sign: () => {}, season: () => {}, month: () => {} })
  go.current.event = goEvent
  go.current.sign = (sign) => { const e = dRef.current.all.find((x) => x.kind === 'ingress' && x.sign === sign); if (e) goEvent(e) }
  go.current.season = (k) => {
    const sg = { spring: 'aries', summer: 'cancer', fall: 'libra', winter: 'capricorn' }[k]
    const e = dRef.current.all.find((x) => x.kind === 'season' && dRef.current.Y.days[x.i].sign === sg)
    if (e) goEvent(e)
  }
  go.current.month = (mo) => goEvent(freeHumanWheelMonth(dRef.current.Y, dRef.current.evs, mo))
  const stableGo = useMemo<Go>(() => ({ event: (e) => go.current.event(e), sign: (x) => go.current.sign(x), season: (x) => go.current.season(x), month: (x) => go.current.month(x) }), [])

  const apply = (day: number) => {
    const d = dRef.current
    if (rotorRef.current) rotorRef.current.style.transform = `rotate(${((-day / d.Y.n) * 360).toFixed(3)}deg)`
    const pc = `${((day / d.Y.n) * 100).toFixed(3)}%`
    if (markerRef.current) markerRef.current.style.left = pc
    if (progressRef.current) progressRef.current.style.width = pc
    const pin = st.current.pin
    if (pin) { const dd = Math.abs(day - pin.i); if (!m.current.pinArrived) { if (dd < 0.6) m.current.pinArrived = true } else if (dd > 1.5) set({ pin: null }) }
    const di = clamp(Math.round(day), 0, d.Y.n - 1)
    const act = nearest(day)
    if (act !== st.current.act && st.current.mode === 'scroll' && st.current.stuck && m.current.flashCount < 4) {
      m.current.flashCount++
      set({ flash: true })
      clearTimeout(timers.current.flash)
      timers.current.flash = setTimeout(() => set({ flash: false }), 650)
    }
    const now = performance.now()
    const settling = Math.abs(c.current.target - day) < 0.4 || st.current.mode === 'scroll'
    if (act !== st.current.act || (di !== st.current.di && (settling || now - m.current.lastSet > 120))) { m.current.lastSet = now; set({ di, act }) }
    else if (di !== st.current.di) { clearTimeout(timers.current.di); timers.current.di = setTimeout(() => apply(c.current.day), 130) }
  }
  const applyRef = useRef(apply)
  applyRef.current = apply
  const setMode = (mode: Mode) => {
    if (mode === st.current.mode) return
    const keep = c.current.day
    set({ mode })
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (mode === 'scroll') { scrollToDay(keep, false); m.current.switching = false }
      else { const r = rootRef.current; if (r) window.scrollTo({ top: window.scrollY + r.getBoundingClientRect().top, behavior: 'instant' }); c.current.target = dRef.current.stops[nearest(keep)]?.i ?? 0; c.current.day = keep }
    }))
  }
  const afterChange = (keepDay: number) => {
    const d = dRef.current
    if (!d.stops.length) return
    const k = nearest(keepDay)
    c.current.applied = -1
    if (st.current.mode === 'scroll') requestAnimationFrame(() => { scrollToDay(d.stops[k].i, false); c.current.day = d.stops[k].i })
    else c.current.target = d.stops[k].i
  }
  const setYear = (y: number) => {
    if (!(years as readonly number[]).includes(y)) return
    const Yn = yearOf(y)
    const tt = todayIdxFor(y, Yn)
    const day = tt >= 0 ? tt : freeHumanWheelStops(Yn, gatherings, st.current.filters).stops[0]?.i ?? 0
    set({ year: y, pin: null })
    c.current.day = c.current.target = day
    c.current.applied = -1
  }
  const toggle = (k: string) => {
    const f = { ...st.current.filters, [k]: !st.current.filters[k] }
    if (!Object.values(f).some(Boolean)) return
    const keep = c.current.day
    set({ filters: f })
    requestAnimationFrame(() => afterChange(keep))
  }

  // the loop, the keys and the sizes
  useEffect(() => {
    const tm = timers.current
    m.current.reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const wide = window.innerWidth >= 860
    set({ wide, mode: wide && defaultMode === 'scroll' ? 'scroll' : 'click' })
    m.current.last = performance.now()
    let raf = 0
    let alive = true
    const loop = (now: number) => {
      if (!alive) return
      const fr = Math.max(0.25, Math.min(4, (now - m.current.last) / 16.7))
      m.current.last = now
      const cc = c.current
      const k = (x: number) => 1 - Math.pow(1 - x, fr)
      const cur = st.current
      const root = rootRef.current
      if (cur.mode === 'scroll' && root) {
        const r = root.getBoundingClientRect()
        const tgt = dayAtP(clamp((stickTop() - r.top) / range()))
        if (!m.current.drag) cc.day += (tgt - cc.day) * (m.current.reduce ? 1 : k(0.14))
      } else if (!m.current.drag) cc.day += (cc.target - cc.day) * (m.current.reduce ? 1 : k(0.1))
      if (cur.mode === 'click' && cur.wide && !m.current.noAuto && !m.current.switching && window.scrollY > 40) { m.current.switching = true; setMode('scroll') }
      const stuck = cur.mode === 'scroll' && !!root && root.getBoundingClientRect().top <= stickTop() + 2
      if (stuck !== cur.stuck) set({ stuck })
      if (Math.abs(cc.day - cc.applied) > 0.002) { cc.applied = cc.day; applyRef.current(cc.day) }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    const onKey = (e: KeyboardEvent) => {
      if (/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement | null)?.tagName ?? '')) return
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1) }
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1) }
    }
    const onResize = () => { const w = window.innerWidth >= 860; if (w !== st.current.wide) { set({ wide: w }); if (!w && st.current.mode === 'scroll') setMode('click') } }
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    let ro: ResizeObserver | undefined
    if (typeof ResizeObserver === 'function' && stageRef.current) {
      ro = new ResizeObserver(() => {
        const g = stageRef.current, h = headRef.current
        if (!g) return
        const hgt = Math.round(g.offsetHeight)
        const hh = h ? Math.round(h.getBoundingClientRect().bottom - g.getBoundingClientRect().top + 4) : 100
        if (hgt !== st.current.stageH || hh !== st.current.headH) set({ stageH: hgt, headH: hh })
      })
      ro.observe(stageRef.current)
    }
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); ro?.disconnect(); clearTimeout(tm.flash); clearTimeout(tm.di) }
    // the loop reads everything it needs through refs, so it starts once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── what to show
  const N = D.stops.length
  const act = clamp(s.act, 0, Math.max(0, N - 1))
  const stop = D.stops[act]
  const pin = s.pin
  const p: FreeHumanWheelEvent | Pin = pin ?? stop?.items[0] ?? { i: 0, kind: 'month', title: '', sub: '', text: '' }
  const shown: FreeHumanWheelStop | undefined = pin ? { i: pin.i, items: [pin as FreeHumanWheelEvent] } : stop
  const day = Y.days[clamp(s.di, 0, Y.n - 1)]
  const sign = day.sign
  const hov = s.hover >= 0 && s.hover < N ? D.stops[s.hover] : null
  const ref = s.mode === 'scroll' ? c.current.day : c.current.target
  let pk = -1
  D.stops.forEach((x, j) => { if (x.i < ref - 0.5) pk = j })
  const nk = D.stops.findIndex((x) => x.i > ref + 0.5)
  const tipLeft = hov ? (hov.i / Y.n) * 100 : 0
  const uid = uidOf(Y.y)
  const dateLabel = `${freeHumanWheelMonthDay(day)}`
  const prevYearOn = (years as readonly number[]).includes(s.year - 1)
  const nextYearOn = (years as readonly number[]).includes(s.year + 1)
  const isOurs = p.kind === 'gathering'
  const rootStyle: CSSProperties = s.mode === 'scroll' ? { position: 'relative', height: `calc(${Math.max(0, N - 1) * stepHeight}vh + ${s.stageH}px)` } : { position: 'relative' }
  const stageStyle: CSSProperties = s.wide ? { position: 'sticky', top: `${stickTop()}px` } : { position: 'relative' }
  const vars = { '--fhw-stick': `${stickOffset}px`, '--fhw-head': `${Math.max(90, s.headH || 0)}px` } as CSSProperties

  const onDown = (e: RPointerEvent) => { if (e.button !== 0 || !faceRef.current) return; m.current.drag = { a: angAt(e), day: c.current.day, moved: 0, id: e.pointerId } }
  const angAt = (e: RPointerEvent) => { const r = faceRef.current!.getBoundingClientRect(); return (Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180) / Math.PI }
  const onMove = (e: RPointerEvent) => {
    const g = m.current.drag
    if (!g || !faceRef.current) return
    const a = angAt(e)
    let da = a - g.a
    if (da > 180) da -= 360
    if (da < -180) da += 360
    g.a = a
    g.moved += Math.abs(da)
    if (g.moved > 2 && !g.cap) { g.cap = true; try { faceRef.current.setPointerCapture(g.id) } catch { /* the pointer is gone */ } faceRef.current.dataset.grab = 'true' }
    g.day = clamp(g.day - (da * Y.n) / 360, 0, Y.n - 1)
    if (g.moved > 2) { c.current.day = c.current.target = g.day; if (st.current.mode === 'scroll') scrollToDay(g.day, false) }
  }
  const onUp = () => {
    const g = m.current.drag
    m.current.drag = null
    if (faceRef.current) delete faceRef.current.dataset.grab
    if (!g || g.moved <= 2) return
    m.current.suppress = true
    setTimeout(() => { m.current.suppress = false }, 0)
    goStop(nearest(g.day))
  }

  const moonSize = 100
  return (
    <div className="fhw" style={vars}>
      <div ref={rootRef} className="fhw-root" data-mode={s.mode} style={rootStyle}>
        <div ref={stageRef} className="fhw-stage" style={stageStyle}>
          <section className="fhw-hero">
            <div className="fhw-top">
              <span className="fhw-label">{eyebrow}</span>
              <div className="fhw-tools">
                <div role="radiogroup" aria-label="How to turn the wheel" className="fhw-modes" data-wide={s.wide}>
                  {([['click', 'Turn by hand'], ['scroll', 'Turn by scroll']] as const).map(([k, label]) => (
                    <button key={k} type="button" role="radio" aria-checked={s.mode === k} className="fhw-mode" onClick={() => { if (k === 'click') m.current.noAuto = true; setMode(k) }}>{label}</button>
                  ))}
                </div>
                {t >= 0 && Math.abs(t - s.di) > 1 && (
                  <button type="button" className="fhw-today" onClick={() => { if (st.current.pin) set({ pin: null }); goDay(t) }}><span aria-hidden="true">{`☉${FREE_HUMAN_TEXT_MARK}`}</span>Jump to today</button>
                )}
                <div className="fhw-year">
                  <button type="button" aria-label="Previous year" className="fhw-year-btn" disabled={!prevYearOn} onClick={() => setYear(s.year - 1)}>‹</button>
                  <span className="fhw-year-n">{s.year}</span>
                  <button type="button" aria-label="Next year" className="fhw-year-btn" disabled={!nextYearOn} onClick={() => setYear(s.year + 1)}>›</button>
                </div>
              </div>
            </div>
            <h2 ref={headRef} className="fhw-title">{title}</h2>
            <div className="fhw-main">
              <div className="fhw-panel">
                {s.wide && s.mode === 'scroll' && s.stuck && (
                  <button type="button" className="fhw-pill" data-flash={s.flash} aria-label="Exit scroll mode" title="Scrolling turns the wheel. Exit to click through instead." onClick={() => { m.current.noAuto = true; setMode('click') }}>
                    <span aria-hidden="true">{`✕${FREE_HUMAN_TEXT_MARK}`}</span><span>Exit scroll mode</span>
                  </button>
                )}
                <span className="fhw-label fhw-nowrap">{shown ? `${freeHumanWheelKindLabel(p as FreeHumanWheelEvent)} · ${freeHumanWheelDate(Y.y, shown.i)}` : ''}</span>
                <h3 className="fhw-stop-title">{p.title}</h3>
                <span className="fhw-stop-sub">{p.sub}</span>
                <p className="fhw-stop-text">{p.text}</p>
                {isOurs && <a className="fhw-open" href={calendarHref}>See it in the calendar <span aria-hidden="true">→</span></a>}
                <button type="button" className="fhw-step" aria-label="Previous event" onClick={() => step(-1)}>
                  <span className="fhw-step-btn" aria-hidden="true">‹</span>
                  <span className="fhw-step-copy"><span className="fhw-step-k">Before</span><span className="fhw-step-v">{pk >= 0 ? D.stops[pk].items[0].title : 'The year begins'}</span></span>
                </button>
              </div>

              <div className="fhw-wrap">
                <div ref={faceRef} className="fhw-face" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onClickCapture={(e) => { if (m.current.suppress) { e.stopPropagation(); e.preventDefault() } }}>
                  <div className="fhw-disc" aria-hidden="true" />
                  <div className="fhw-stars" aria-hidden="true"><div /></div>
                  <div ref={rotorRef} className="fhw-rotor" style={{ transform: `rotate(${((-c.current.day / Y.n) * 360).toFixed(3)}deg)` }}>
                    <WheelLayer Y={Y} sign={sign} kind="under" />
                    <WheelBase Y={Y} evs={D.evs} retro={s.filters.retro} go={stableGo} uid={uid} />
                    <WheelLayer Y={Y} sign={sign} kind="over" stop={shown} />
                    {hov && hov !== shown && <HoverRing Y={Y} stop={hov} />}
                  </div>
                  <div className="fhw-frame" aria-hidden="true"><Frame /></div>
                  <div className="fhw-center">
                    <div className="fhw-moon"><FreeHumanMoon phase={day.phase} size={moonSize} /></div>
                    <span className="fhw-center-date">{dateLabel}</span>
                  </div>
                </div>
              </div>

              <div className="fhw-read">
                {([['Date', `${dateLabel}${t === s.di ? ', today' : ''}`], ['Sun in', `${FREE_HUMAN_SIGN_GLYPH[sign]}${FREE_HUMAN_TEXT_MARK} ${cap(sign)}`], ['Season', FREE_HUMAN_SEASON_NAME[freeHumanWheelSeasonOf(sign)]], ['Moon', freeHumanWheelPhaseName(day.phase)]] as const).map(([k, v]) => (
                  <div key={k} className="fhw-fact"><span className="fhw-label">{k}</span><span className="fhw-fact-v">{v}</span></div>
                ))}
                <button type="button" className="fhw-step" aria-label="Next event" onClick={() => step(1)}>
                  <span className="fhw-step-copy"><span className="fhw-step-k">Next</span><span className="fhw-step-v">{nk >= 0 ? D.stops[nk].items[0].title : 'The year ends'}</span></span>
                  <span className="fhw-step-btn" aria-hidden="true">›</span>
                </button>
              </div>
            </div>
          </section>

          <section className="fhw-thread">
            <div className="fhw-thread-bar">
              {FREE_HUMAN_MONTH_SHORT.map((_, j) => (
                <button key={j} type="button" className="fhw-t-month" data-on={day.m === j} style={{ left: PERCENT((Y.monthStart[j] / Y.n) * 100) }} onClick={() => stableGo.month(j)}>{FREE_HUMAN_MONTH_LONG[j]}</button>
              ))}
              {Y.tSigns.map((r) => {
                const w = ((r.e - r.s) / Y.n) * 100
                return <button key={`${r.sign}${r.s}`} type="button" className="fhw-t-sign" data-on={r.sign === sign} style={{ left: PERCENT((r.s / Y.n) * 100), width: PERCENT(w) }} onClick={() => stableGo.sign(r.sign)}>{w >= 4.5 ? `${FREE_HUMAN_SIGN_GLYPH[r.sign]}${FREE_HUMAN_TEXT_MARK} ${cap(r.sign)}` : ''}</button>
              })}
              {Y.tSeasons.map(([k, a, b], j) => {
                const w = ((b - a) / Y.n) * 100
                return <span key={`${k}${j}`} className="fhw-t-season" style={{ left: PERCENT((a / Y.n) * 100), width: `calc(${w}% - 3px)`, '--fhw-fill': `color-mix(in oklch, ${SEASON_FILL[k]} ${freeHumanWheelSeasonOf(sign) === k ? 60 : 32}%, var(--fh-cream-50))`, color: `var(--season-${k}-ink)` } as CSSProperties}>{w >= 6 ? FREE_HUMAN_SEASON_NAME[k] : ''}</span>
              })}
              <span className="fhw-t-rule" />
              <span ref={progressRef} className="fhw-t-progress" aria-hidden="true" style={{ width: PERCENT(Number(((c.current.day / Y.n) * 100).toFixed(3))) }} />
              {D.stops.map((x, j) => (
                <button key={`${x.i}${j}`} type="button" className="fhw-t-dot" data-hover={j === s.hover} data-act={j === act} aria-label={`${x.items[0].title}, ${freeHumanWheelDate(Y.y, x.i)}`} style={{ left: PERCENT((x.i / Y.n) * 100), zIndex: j === act || j === s.hover ? 3 : 1 }}
                  onClick={() => goStop(j)} onMouseEnter={() => set({ hover: j })} onMouseLeave={() => { if (st.current.hover === j) set({ hover: -1 }) }} onFocus={() => set({ hover: j })} onBlur={() => { if (st.current.hover === j) set({ hover: -1 }) }}>
                  <KindDot kind={x.items[0].kind} size={8} faded={false} />
                </button>
              ))}
              <div ref={markerRef} className="fhw-marker" aria-hidden="true" style={{ left: PERCENT(Number(((c.current.day / Y.n) * 100).toFixed(3))) }}><span className="fhw-marker-date">{dateLabel}</span><span className="fhw-marker-line" /><span className="fhw-marker-dot" /></div>
              {hov && (
                <div role="tooltip" className="fhw-tip" style={{ left: PERCENT(tipLeft), transform: tipLeft < 12 ? 'translateX(-14px)' : tipLeft > 88 ? 'translateX(calc(-100% + 14px))' : 'translateX(-50%)' }}>
                  <span className="fhw-label">{`${freeHumanWheelKindLabel(hov.items[0])} · ${freeHumanWheelDate(Y.y, hov.i)}`}</span>
                  <span className="fhw-tip-title">{hov.items[0].title}</span>
                  <span className="fhw-tip-ctx">{freeHumanWheelContext(Y.days[hov.i])}</span>
                  {hov.items.length > 1 && <span className="fhw-tip-also">{`Also · ${hov.items.slice(1).map((x) => x.title).join(' · ')}`}</span>}
                </div>
              )}
            </div>
            <div className="fhw-layers">
              {FREE_HUMAN_WHEEL_LAYERS.map(([k, label, kind]) => (
                <button key={k} type="button" className="fhw-layer" aria-pressed={s.filters[k]} onClick={() => toggle(k)}>
                  <KindDot kind={kind} faded={!s.filters[k]} />{label}
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function HoverRing({ Y, stop }: { Y: FreeHumanWheelYear; stop: FreeHumanWheelStop }) {
  const e = stop.items[0]
  const [x, y] = P(RADIUS[e.kind] || 30, (stop.i / Y.n) * 360)
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" className="fhw-svg fhw-over" aria-hidden="true">
      <circle cx={x} cy={y} r={e.kind === 'ingress' || e.kind === 'month' ? 1.6 : 2.6} className="fhw-ring" data-hover="true" />
    </svg>
  )
}
