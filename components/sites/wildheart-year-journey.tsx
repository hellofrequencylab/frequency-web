'use client'

import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { WILDHEART_GLYPHS } from '@/lib/theme/wildheart-symbols'
import { WhMoon } from './wildheart-symbols'

// THE YEAR JOURNEY (the design handoff's components/calendar/YearJourney.jsx, 2026-10-13): the Home page's
// pinned, scroll-scrubbed wheel. An outer runway of (N-1) x 68vh + 100vh - offset holds a sticky stage; as
// the page scrolls, the wheel turns through up to fourteen curated stops (the year opens, the first sign
// ingress, the eight festivals, the first full moon, the program's own dates), resting on each while its
// panel reads. One rAF loop lerps toward the scroll target and writes transforms straight to refs; React
// state changes only when the sign, season, moon phase or active stop changes. Drag the wheel to spin it
// with momentum; arrow keys step the stops; the rail jumps. Reduced motion follows the scroll exactly with
// no tilt or glow. No SVG filter, backdrop-filter or blur touches anything that moves.
//
// A client island: every word and date arrives as data from the server block
// (components/page-editor/blocks/wildheart.tsx, WildheartYearJourneyBlock), which reads the sky and the
// Space's own events. Every colour and face is a token (components/sites/wildheart-css.ts).

export interface YearStop {
  iso: string
  /** Days from the start of the window. */
  day: number
  kind: 'today' | 'ingress' | 'festival' | 'moon' | 'program'
  title: string
  note: string
  teach: string
  /** The sign's id for an ingress stop (its glyph is the mark). */
  sign?: string
  /** The moon's phase for a today or moon stop. */
  phase?: number
  /** The events that fall before the next stop, at most four. */
  passing: { label: string; title: string }[]
}

export interface YearGeometry {
  months: { name: string; a: number; mid: number; iso: string }[]
  signs: { id: string; name: string; house: string; a: number; a1: number; mid: number; iso: string }[]
  seasons: { id: string; a0: number; a1: number }[]
  fests: { title: string; a: number; iso: string }[]
  dots: { kind: 'circle' | 'foundation' | 'moon' | 'retreat' | 'gathering'; a: number; title: string }[]
}

export interface YearJourneyData {
  /** The wheel angle of the window's first day, in degrees (0 at the top). */
  a0: number
  /** Days in the window, first stop to last. */
  span: number
  stops: YearStop[]
  geo: YearGeometry
  /** Per day of the window: the sign, its house, the season, the moon phase and the date label. */
  table: { date: string; sign: string; signName: string; house: string; season: string; seasonName: string; phase: number; phaseName: string }[]
  labels: { calendar: string; sky: string; season: string; moon: string; skip: string; tip: string; save: string; year: string; aria: string }
  enrollHref: string | null
  yearHref: string | null
}

const HOLD = 0.2
const STEP_VH = 68
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x))
const ss = (t: number) => t * t * (3 - 2 * t)
const invSS = (u: number) => {
  let lo = 0
  let hi = 1
  for (let i = 0; i < 20; i++) {
    const m = (lo + hi) / 2
    if (ss(m) < u) lo = m
    else hi = m
  }
  return (lo + hi) / 2
}
const P = (r: number, a: number): [number, number] => {
  const t = ((a - 90) * Math.PI) / 180
  return [50 + r * Math.cos(t), 50 + r * Math.sin(t)]
}
const arc = (r: number, a0: number, a1: number) => {
  const [x0, y0] = P(r, a0)
  const [x1, y1] = P(r, a1)
  return `M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`
}
const wedge = (r0: number, r1: number, a0: number, a1: number) => {
  const [x0, y0] = P(r1, a0)
  const [x1, y1] = P(r1, a1)
  const [x2, y2] = P(r0, a1)
  const [x3, y3] = P(r0, a0)
  const L = a1 - a0 > 180 ? 1 : 0
  return `M${x0} ${y0}A${r1} ${r1} 0 ${L} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${L} 0 ${x3} ${y3}Z`
}
const glyphOf = (id: string) => WILDHEART_GLYPHS[id] ?? id
const DAY = 864e5
const dayOfIso = (iso: string, startIso: string) => Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(+startIso.slice(0, 4), +startIso.slice(5, 7) - 1, +startIso.slice(8, 10))) / DAY)

/** The wheel's rings: static SVG, drawn once. Hovering a month or sign tints its wedge; clicking travels. */
const Wheel = memo(function Wheel({ geo, sign, season, onPick }: { geo: YearGeometry; sign: string; season: string; onPick: (iso: string) => void }) {
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" className="wh-yj-rings">
      {geo.signs.filter((s) => s.id === sign).map((s) => (
        <path key="act" className="wh-yj-active" d={wedge(34, 43, s.a, s.a1)} />
      ))}
      <circle cx="50" cy="50" r="43" className="wh-yj-ring" />
      <circle cx="50" cy="50" r="34" className="wh-yj-ring" />
      <circle cx="50" cy="50" r="26" className="wh-yj-ring-dotted" />
      {Array.from({ length: 73 }, (_, i) => {
        const a = (i * 5 * 360) / 365
        const [x0, y0] = P(48.8, a)
        const [x1, y1] = P(47.6, a)
        return <line key={`t${i}`} x1={x0} y1={y0} x2={x1} y2={y1} className="wh-yj-tick" />
      })}
      {geo.months.map((m) => {
        const [x0, y0] = P(49, m.a)
        const [x1, y1] = P(43, m.a)
        return (
          <g key={m.name} onClick={() => onPick(m.iso)} className="wh-yj-pick">
            <title>{`Travel to ${m.name}`}</title>
            <path className="wh-yj-hit" d={wedge(43, 49, m.a, m.a + 30)} />
            <line x1={x0} y1={y0} x2={x1} y2={y1} className="wh-yj-month" />
            <text x="50" y="4.6" transform={`rotate(${m.mid} 50 50)`} className="wh-yj-month-label">{m.name.toUpperCase()}</text>
          </g>
        )
      })}
      {geo.signs.map((s) => {
        const [x0, y0] = P(43, s.a)
        const [x1, y1] = P(34, s.a)
        const on = s.id === sign
        return (
          <g key={s.id} onClick={() => onPick(s.iso)} className="wh-yj-pick">
            <title>{`${s.name} · house ${s.house}`}</title>
            <path className="wh-yj-hit" d={wedge(34, 43, s.a, s.a1)} />
            <line x1={x0} y1={y0} x2={x1} y2={y1} className="wh-yj-sign-line" />
            <g transform={`rotate(${s.mid} 50 50)`}>
              <text x="50" y="10.6" className="wh-yj-glyph" data-on={on ? '' : undefined}>{glyphOf(s.id)}</text>
              <text x="50" y="14.4" className="wh-yj-house">{s.house}</text>
            </g>
          </g>
        )
      })}
      {geo.seasons.map((s) => (
        <path key={s.id} d={arc(30.6, s.a0 + 0.8, s.a1 - 0.8)} className="wh-yj-season" data-season={s.id} data-now={s.id === season ? '' : undefined} />
      ))}
      {geo.dots.map((d, i) => {
        const [x, y] = P(d.kind === 'moon' ? 28.2 : 27.6, d.a)
        return (
          <circle key={i} cx={x} cy={y} r={d.kind === 'moon' || d.kind === 'retreat' ? 0.7 : 0.42} className="wh-yj-dot" data-kind={d.kind}>
            <title>{d.title}</title>
          </circle>
        )
      })}
      {geo.fests.map((f) => {
        const [x, y] = P(30.6, f.a)
        return (
          <g key={f.title + f.iso} onClick={() => onPick(f.iso)} className="wh-yj-pick">
            <title>{f.title}</title>
            <circle cx={x} cy={y} r="1.7" className="wh-yj-fest" />
            <text x={x} y={y + 0.1} className="wh-yj-fest-star">{glyphOf('star')}</text>
          </g>
        )
      })}
    </svg>
  )
})

export function WildheartYearJourney({ data, offset = 72, wheelSize = 600, startIso }: { data: YearJourneyData; offset?: number; wheelSize?: number; startIso: string }) {
  const { stops, geo, table } = data
  const N = Math.max(2, stops.length)
  const [S, setS] = useState(520)
  const [act, setAct] = useState(0)
  const [sky, setSky] = useState(() => ({ sign: table[0]?.sign ?? 'capricorn', season: table[0]?.season ?? 'winter', phase: table[0]?.phase ?? 0 }))
  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const rotorRef = useRef<HTMLDivElement>(null)
  const starsRef = useRef<HTMLDivElement>(null)
  const tiltRef = useRef<HTMLDivElement>(null)
  const faceRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLSpanElement>(null)
  const tipsRef = useRef<HTMLDivElement>(null)
  const countRef = useRef<HTMLSpanElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)
  const panels = useRef<(HTMLElement | null)[]>([])
  const out = useRef<Record<string, HTMLSpanElement | null>>({})
  const cur = useRef({ p: 0, applied: -1, di: -1, act: 0, sky: null as null | { sign: string; phase: number; season: string }, tx: 0, ty: 0, gx: 0, gy: 0, ax: 0, ay: 0 })
  const drag = useRef<null | { a: number; day: number; moved: number; id: number; v: number; t: number; cap?: boolean }>(null)
  const mom = useRef(0)
  const suppress = useRef(false)

  const dayAt = useCallback(
    (p: number) => {
      if (stops.length < 2) return 0
      const s = clamp(p) * (stops.length - 1)
      const i = Math.min(stops.length - 2, Math.floor(s))
      const t = s - i
      const u = ss(clamp((t - HOLD) / (1 - 2 * HOLD)))
      return stops[i].day + (stops[i + 1].day - stops[i].day) * u
    },
    [stops],
  )
  const pAt = useCallback(
    (day: number) => {
      if (stops.length < 2) return 0
      day = clamp(day, 0, data.span)
      let i = 0
      while (i < stops.length - 2 && day > stops[i + 1].day) i++
      const a = stops[i].day
      const b = stops[i + 1].day
      const u = b > a ? (day - a) / (b - a) : 0
      const t = u <= 0 ? 0 : u >= 1 ? 1 : HOLD + (1 - 2 * HOLD) * invSS(u)
      return (i + t) / (stops.length - 1)
    },
    [stops, data.span],
  )
  const range = () => {
    const r = rootRef.current
    return r ? Math.max(1, r.offsetHeight - (window.innerHeight - offset)) : 1
  }
  const scrollToP = (p: number, smooth: boolean) => {
    const r = rootRef.current
    if (!r) return
    const top = window.scrollY + r.getBoundingClientRect().top - offset + clamp(p) * range()
    window.scrollTo({ top, behavior: smooth ? 'smooth' : 'instant' })
  }

  const apply = useCallback(
    (p: number) => {
      const c = cur.current
      const s = p * (N - 1)
      const day = dayAt(p)
      const rot = -(data.a0 + (day * 360) / 365)
      if (rotorRef.current) rotorRef.current.style.transform = `rotate(${rot.toFixed(3)}deg)`
      if (starsRef.current) starsRef.current.style.transform = `rotate(${(rot * 0.35).toFixed(3)}deg)`
      panels.current.forEach((el, k) => {
        if (!el) return
        const d = s - k
        const o = clamp((0.55 - Math.abs(d)) / 0.35)
        el.style.opacity = o.toFixed(3)
        el.style.transform = `translate3d(0,${(-d * 36).toFixed(1)}px,0)`
        el.style.pointerEvents = o > 0.5 ? 'auto' : 'none'
        el.style.visibility = o <= 0 ? 'hidden' : 'visible'
      })
      if (fillRef.current) fillRef.current.style.transform = `scaleX(${p.toFixed(4)})`
      if (tipsRef.current) tipsRef.current.style.opacity = String(clamp(1 - (p * (N - 1)) / 0.6))
      const di = Math.round(clamp(day, 0, data.span))
      if (di !== c.di) {
        c.di = di
        const k = table[di]
        if (k) {
          const o = out.current
          if (o.date) o.date.textContent = k.date
          if (o.sign) o.sign.textContent = `${k.signName} · ${k.house}`
          if (o.season) o.season.textContent = k.seasonName
          if (o.moon) o.moon.textContent = k.phaseName
          const sk = c.sky
          if (!sk || sk.sign !== k.sign || sk.phase !== k.phase || sk.season !== k.season) {
            c.sky = { sign: k.sign, phase: k.phase, season: k.season }
            setSky(c.sky)
          }
        }
      }
      const a = Math.round(s)
      if (a !== c.act) {
        c.act = a
        setAct(a)
      }
      if (countRef.current) countRef.current.textContent = `${String(a + 1).padStart(2, '0')} / ${String(N).padStart(2, '0')}`
    },
    [data.a0, data.span, N, dayAt, table],
  )

  useEffect(() => {
    const f = () => setS(Math.round(clamp(Math.min(window.innerHeight - offset - 150, window.innerWidth * 0.42), 320, wheelSize)))
    f()
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [wheelSize, offset])

  useEffect(() => {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let id = 0
    let vis = true
    let alive = true
    const c = cur.current
    c.applied = -1
    c.di = -1
    const tick = () => {
      id = 0
      if (!alive) return
      const r = rootRef.current
      if (r) {
        const tgt = clamp((offset - r.getBoundingClientRect().top) / range())
        c.p = reduce || drag.current || mom.current ? tgt : c.p + (tgt - c.p) * 0.14
        if (Math.abs(tgt - c.p) < 0.00005) c.p = tgt
        if (Math.abs(c.p - c.applied) > 0.00002) {
          c.applied = c.p
          apply(c.p)
        }
        if (!reduce) {
          c.ax += (c.tx - c.ax) * 0.08
          c.ay += (c.ty - c.ay) * 0.08
          if (tiltRef.current) tiltRef.current.style.transform = `rotateX(${c.ay.toFixed(2)}deg) rotateY(${c.ax.toFixed(2)}deg)`
          if (glowRef.current) glowRef.current.style.transform = `translate3d(${c.gx.toFixed(0)}px,${c.gy.toFixed(0)}px,0)`
        }
      }
      if (vis) id = requestAnimationFrame(tick)
    }
    const io = new IntersectionObserver(
      (es) => {
        vis = es[0].isIntersecting
        if (vis && !id) id = requestAnimationFrame(tick)
      },
      { rootMargin: '200px 0px' },
    )
    if (rootRef.current) io.observe(rootRef.current)
    const r = rootRef.current
    if (r) {
      c.p = clamp((offset - r.getBoundingClientRect().top) / range())
      apply(c.p)
    }
    id = requestAnimationFrame(tick)
    return () => {
      alive = false
      io.disconnect()
      if (id) cancelAnimationFrame(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- range reads refs only
  }, [apply, offset])

  const onStageMove = (e: ReactPointerEvent) => {
    const c = cur.current
    const st = stageRef.current
    const f = faceRef.current
    if (!st || !f) return
    const b = st.getBoundingClientRect()
    c.gx = e.clientX - b.left - 260
    c.gy = e.clientY - b.top - 260
    if (drag.current) return
    const fr = f.getBoundingClientRect()
    const nx = clamp((e.clientX - (fr.left + fr.width / 2)) / fr.width, -1, 1)
    const ny = clamp((e.clientY - (fr.top + fr.height / 2)) / fr.height, -1, 1)
    c.tx = nx * 7
    c.ty = -ny * 7
  }
  const onStageLeave = () => {
    cur.current.tx = 0
    cur.current.ty = 0
  }
  const angAt = (e: ReactPointerEvent) => {
    const r = faceRef.current!.getBoundingClientRect()
    return (Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180) / Math.PI
  }
  const onDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    mom.current = 0
    drag.current = { a: angAt(e), day: dayAt(cur.current.p), moved: 0, id: e.pointerId, v: 0, t: performance.now() }
    cur.current.tx = 0
    cur.current.ty = 0
  }
  const onMove = (e: ReactPointerEvent) => {
    const g = drag.current
    if (!g) return
    const a = angAt(e)
    let da = a - g.a
    if (da > 180) da -= 360
    if (da < -180) da += 360
    g.a = a
    g.moved += Math.abs(da)
    const now = performance.now()
    const dt = Math.max(1, now - g.t)
    g.t = now
    g.v = g.v * 0.6 + ((-da * 365) / 360 / dt) * 0.4
    if (g.moved > 2 && !g.cap) {
      g.cap = true
      try {
        faceRef.current?.setPointerCapture(g.id)
      } catch {
        /* a pointer that already left */
      }
      if (faceRef.current) faceRef.current.style.cursor = 'grabbing'
    }
    g.day = clamp(g.day - (da * 365) / 360, 0, data.span)
    if (g.moved > 2) scrollToP(pAt(g.day), false)
  }
  const onUp = () => {
    const g = drag.current
    drag.current = null
    if (faceRef.current) faceRef.current.style.cursor = 'grab'
    if (!g || g.moved <= 2) return
    suppress.current = true
    setTimeout(() => {
      suppress.current = false
    }, 0)
    let v = clamp(g.v, -1.2, 1.2)
    let day = g.day
    if (Math.abs(v) < 0.02 || performance.now() - g.t > 80) return
    const tok = Math.random()
    mom.current = tok
    let last = performance.now()
    const step = (now: number) => {
      if (mom.current !== tok) return
      const dt = Math.min(40, now - last)
      last = now
      day = clamp(day + v * dt, 0, data.span)
      v *= Math.pow(0.94, dt / 16)
      scrollToP(pAt(day), false)
      if (Math.abs(v) > 0.01 && day > 0 && day < data.span) requestAnimationFrame(step)
      else {
        mom.current = 0
        const s = pAt(day) * (N - 1)
        scrollToP(Math.round(s) / (N - 1), true)
      }
    }
    requestAnimationFrame(step)
  }
  const onClickCap = (e: React.MouseEvent) => {
    if (suppress.current) {
      e.stopPropagation()
      e.preventDefault()
    }
  }
  const pick = useCallback(
    (iso: string) => {
      let day = dayOfIso(iso, startIso)
      if (day < 0) day += 365
      scrollToP(pAt(day), true)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scrollToP reads refs only
    [startIso, pAt],
  )
  const goStop = (k: number) => {
    mom.current = 0
    scrollToP(k / (N - 1), true)
  }
  const leave = () => {
    const r = rootRef.current
    if (r) window.scrollTo({ top: window.scrollY + r.getBoundingClientRect().bottom - offset - 24, behavior: 'smooth' })
  }
  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault()
      goStop(Math.min(N - 1, act + 1))
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault()
      goStop(Math.max(0, act - 1))
    }
  }

  const R = (r: number, deg: number) => {
    const [x, y] = P(r, deg)
    return { left: `${x}%`, top: `${y}%` }
  }
  const mark = (x: YearStop) =>
    x.kind === 'moon' ? <WhMoon phase={4} size={24} /> : x.kind === 'today' ? <WhMoon phase={x.phase ?? table[0]?.phase ?? 0} size={24} /> : <span className="wh-yj-mark-glyph">{x.kind === 'festival' ? glyphOf('star') : x.kind === 'ingress' ? glyphOf(x.sign ?? '') : glyphOf('spark')}</span>
  const read = (k: string, n: string) => (
    <div key={k} className="wh-yj-read">
      <span className="wh-label wh-label-ink">{n}</span>
      <span ref={(el) => { out.current[k] = el }} className="wh-yj-read-value">&nbsp;</span>
    </div>
  )
  const first = table[0]
  const initial = useMemo(() => `rotate(${-data.a0}deg)`, [data.a0])

  return (
    <div ref={rootRef} className="wh-yj" style={{ height: `calc(${(N - 1) * STEP_VH}vh + 100vh - ${offset}px)` }}>
      <div ref={stageRef} className="wh-yj-stage" tabIndex={0} onKeyDown={onKey} onPointerMove={onStageMove} onPointerLeave={onStageLeave} aria-label={data.labels.aria} style={{ top: offset, height: `calc(100vh - ${offset}px)` }}>
        <div ref={glowRef} aria-hidden="true" className="wh-yj-glow" />
        <div className="wh-yj-grid">
          <div className="wh-yj-panels">
            {stops.map((x, k) => (
              <article key={k} ref={(el) => { panels.current[k] = el }} className="wh-yj-panel" style={{ opacity: k === 0 ? 1 : 0 }}>
                <div className="wh-yj-panel-head">
                  <span className="wh-yj-mark">{mark(x)}</span>
                  <span className="wh-label wh-label-ink">{x.iso ? `${table[x.day]?.date ?? ''} · ${x.iso.slice(0, 4)}` : ''}</span>
                </div>
                <h3 className="wh-yj-title">{x.title}</h3>
                {x.note && <div className="wh-label wh-yj-note">{x.note}</div>}
                <p className="wh-yj-teach">{x.teach}</p>
                {x.passing.length > 0 && (
                  <div className="wh-yj-passing">
                    {x.passing.map((e, j) => (
                      <span key={j} className="wh-yj-pill">
                        <span className="wh-label wh-label-ink">{e.label}</span>
                        <span className="wh-yj-pill-title">{e.title}</span>
                      </span>
                    ))}
                  </div>
                )}
                <div className="wh-yj-actions">
                  {x.kind === 'program' && data.enrollHref && (
                    <a className="hs-btn hs-btn-primary wh-btn-md" href={data.enrollHref}>{data.labels.save}</a>
                  )}
                  {k === stops.length - 1 && data.yearHref && (
                    <a className="wh-textlink" href={data.yearHref}>{data.labels.year}</a>
                  )}
                </div>
              </article>
            ))}
          </div>
          <div className="wh-yj-persp">
            <div ref={faceRef} className="wh-yj-face" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onClickCapture={onClickCap} style={{ width: S, height: S }}>
              <div ref={tiltRef} className="wh-yj-tilt">
                <div className="wh-yj-disc">
                  <div ref={starsRef} aria-hidden="true" className="wh-yj-stars" />
                  <div ref={rotorRef} className="wh-yj-rotor" style={{ transform: initial }}>
                    <Wheel geo={geo} sign={sky.sign} season={sky.season} onPick={pick} />
                  </div>
                </div>
                <div className="wh-yj-moon"><WhMoon phase={sky.phase} size={Math.round(S * 0.3)} /></div>
              </div>
              <div aria-hidden="true" className="wh-yj-needle">
                <span className="wh-yj-needle-cap" />
                <span className="wh-yj-needle-line" style={{ height: S * 0.22 }} />
              </div>
              <div ref={tipsRef} aria-hidden="true" className="wh-yj-tips">
                <span className="wh-yj-tip" style={R(46, 292)}>{data.labels.calendar}</span>
                <span className="wh-yj-tip" style={R(38.5, 310)}>{data.labels.sky}</span>
                <span className="wh-yj-tip" style={R(30.6, 330)}>{data.labels.season}</span>
                <span className="wh-yj-tip" style={R(12, 200)}>{data.labels.moon}</span>
                <span className="wh-yj-hint">{data.labels.tip}</span>
              </div>
            </div>
          </div>
          <div className="wh-yj-readout">
            <span ref={countRef} className="wh-label">01 / {String(N).padStart(2, '0')}</span>
            {read('date', data.labels.calendar)}
            {read('sign', data.labels.sky)}
            {read('season', data.labels.season)}
            {read('moon', data.labels.moon)}
            <button type="button" onClick={leave} className="wh-label wh-yj-skip">{data.labels.skip}</button>
          </div>
        </div>
        <div className="wh-yj-rail">
          <span className="wh-yj-rail-track" />
          <span ref={fillRef} className="wh-yj-rail-fill" />
          {stops.map((x, k) => (
            <button key={k} type="button" onClick={() => goStop(k)} title={`${x.title} · ${table[x.day]?.date ?? ''}`} aria-label={x.title} className="wh-yj-rail-stop" data-on={k === act ? '' : undefined} data-past={k < act ? '' : undefined} style={{ left: `${(k / (N - 1)) * 100}%` }}>
              <span />
            </button>
          ))}
        </div>
      </div>
      {/* The first stop, readable before the island hydrates and by a reader with no script. */}
      {first && <noscript className="wh-yj-noscript">{`${first.date} · ${first.signName} · ${first.seasonName} · ${first.phaseName}`}</noscript>}
    </div>
  )
}
