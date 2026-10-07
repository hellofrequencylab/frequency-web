'use client'

import { useEffect, useRef, useState } from 'react'
import type { MwSeason } from '@/lib/sites/menswork-page'

// The three moving parts of a Menswork website page (components/sites/menswork-page.tsx): the five-beat
// strip a visitor steps through, the circle finder, and the year's season wheel that follows the scroll.
// Every word they show is handed in from the Space's own blocks and rows.

export interface MwBeat {
  letter: string
  word: string
  body: string
}

/** The five-beat strip: one chevron per beat, the picked one filled, its line in the panel below. */
export function MwBeats({ beats, start = 0 }: { beats: MwBeat[]; start?: number }) {
  const [on, setOn] = useState(Math.min(start, beats.length - 1))
  const beat = beats[on]
  return (
    <div className="mw-beats-wrap">
      <div className="mw-beats" role="group" aria-label="The beats">
        {beats.map((b, i) => (
          <button key={b.letter + i} type="button" className="mw-beat" aria-pressed={i === on} onClick={() => setOn(i)}>
            <span className="mw-beat-l">{b.letter}</span>
            <span className="mw-beat-w">{b.word}</span>
          </button>
        ))}
      </div>
      {beat && (beat.word || beat.body) && (
        <div className="mw-frame mw-beat-panel" aria-live="polite">
          <span className="mw-beat-name">{beat.word}</span>
          <span className="mw-beat-body">{beat.body}</span>
        </div>
      )}
    </div>
  )
}

export interface MwCircleCard {
  id: string
  name: string
  where: string | null
  meets: string | null
  about: string | null
  status: 'open' | 'forming' | 'full'
  members: number
  cap: number
  imageUrl: string | null
  host: string | null
  hostAvatar: string | null
  module: string | null
  visitHref: string | null
  frequencyHref: string
}

const STATUS_LABEL: Record<MwCircleCard['status'], string> = { open: 'Open to visitors', forming: 'Forming', full: 'Full, seeding' }

/** The circle finder: filter by status, pick a circle, read its card. */
export function MwCircleFinder({ circles }: { circles: MwCircleCard[] }) {
  const [filter, setFilter] = useState<'all' | MwCircleCard['status']>('all')
  const [sel, setSel] = useState(circles[0]?.id ?? '')
  const shown = circles.filter((c) => filter === 'all' || c.status === filter)
  const c = circles.find((x) => x.id === sel) ?? circles[0]
  const filters = (['all', 'open', 'forming', 'full'] as const).filter(
    (f) => f === 'all' || circles.some((x) => x.status === f),
  )
  if (!c) return null
  return (
    <div className="mw-finder">
      <div className="mw-finder-list">
        {filters.length > 2 && (
          <div className="mw-tags" role="group" aria-label="Filter circles">
            {filters.map((f) => (
              <button key={f} type="button" className="mw-tag" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f === 'open' ? 'Open' : f === 'forming' ? 'Forming' : 'Full'}
              </button>
            ))}
          </div>
        )}
        <ul className="mw-rows">
          {shown.map((x) => (
            <li key={x.id}>
              <button type="button" className="mw-circle-row" aria-pressed={x.id === c.id} onClick={() => setSel(x.id)}>
                <span className="mw-circle-row-name">{x.name}</span>
                <span className="mw-label">{[x.where, x.meets].filter(Boolean).join(' · ')}</span>
                <span className={`mw-badge mw-badge-${x.status}`}>{STATUS_LABEL[x.status]}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <article className="mw-frame mw-circle-card">
        {c.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- a circle cover on an arbitrary host
          <img src={c.imageUrl} alt="" className="mw-circle-photo" loading="lazy" />
        )}
        <div className="mw-circle-body">
          <div className="mw-circle-head">
            <h3 className="mw-display mw-s">{c.name}</h3>
            {c.meets && <span className="mw-label">{c.meets}</span>}
          </div>
          {c.about && <p className="mw-body">{c.about}</p>}
          {c.cap > 0 && <MwChevronProgress label={`${c.members} of ${c.cap} men`} value={c.members} total={c.cap} />}
          {(c.host || c.module) && (
            <div className="mw-circle-meta">
              {c.host && (
                <span className="mw-person">
                  {c.hostAvatar && (
                    // eslint-disable-next-line @next/next/no-img-element -- a member avatar on an arbitrary host
                    <img src={c.hostAvatar} alt="" className="mw-avatar" />
                  )}
                  <span>
                    <span className="mw-label">Host</span>
                    <strong>{c.host}</strong>
                  </span>
                </span>
              )}
              {c.module && (
                <span>
                  <span className="mw-label">This module</span>
                  <strong>{c.module}</strong>
                </span>
              )}
            </div>
          )}
          <div className="mw-actions">
            {c.visitHref && c.status !== 'full' && (
              <a href={c.visitHref} className="hs-btn hs-btn-primary">
                {c.status === 'forming' ? 'Join the waitlist' : 'Ask to visit'}
              </a>
            )}
            <a href={c.frequencyHref} className="mw-textlink" target="_blank" rel="noopener noreferrer">
              View on Frequency
            </a>
          </div>
        </div>
      </article>
    </div>
  )
}

/** Seats as chevrons: filled for taken, the next one hatched, the rest empty. */
export function MwChevronProgress({ label, value, total }: { label: string; value: number; total: number }) {
  const n = Math.max(1, Math.min(total, 24))
  const done = Math.min(n, Math.max(0, Math.floor(value)))
  return (
    <div className="mw-progress">
      <div className="mw-progress-head">
        <span className="mw-label">{label}</span>
        <span className="mw-progress-count">
          {String(done).padStart(2, '0')}
          <span>/{String(n).padStart(2, '0')}</span>
        </span>
      </div>
      <div className="mw-progress-bar" style={{ gridTemplateColumns: `repeat(${n},minmax(0,1fr))` }} aria-hidden>
        {Array.from({ length: n }, (_, i) => (
          <span key={i} data-state={i < done ? 'done' : i === done ? 'next' : 'empty'} />
        ))}
      </div>
    </div>
  )
}

export interface MwWheelSeason {
  id: MwSeason
  name: string
  range: string
  arc: string | null
}

/** The year's wheel: an octagon of four seasons that turns as the page scrolls, the season whose section
 *  has crossed 45% of the window at the top, and the site's accent following it. */
export function MwYearWheel({ seasons, calendarHref }: { seasons: MwWheelSeason[]; calendarHref?: string | null }) {
  const [active, setActive] = useState(seasons[0]?.id ?? 'winter')
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const site = root.current?.closest<HTMLElement>('[data-house-theme]')
    const before = site?.dataset.season
    let raf = 0
    const update = () => {
      raf = 0
      const line = window.innerHeight * 0.45
      let cur = seasons[0]?.id
      for (const s of seasons) {
        const el = document.getElementById(`season-${s.id}`)
        if (el && el.getBoundingClientRect().top <= line) cur = s.id
      }
      if (cur) setActive(cur)
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    on()
    return () => {
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
      if (raf) cancelAnimationFrame(raf)
      if (site && before) site.dataset.season = before
    }
  }, [seasons])
  useEffect(() => {
    const site = root.current?.closest<HTMLElement>('[data-house-theme]')
    if (site) site.dataset.season = active
  }, [active])

  const order: MwSeason[] = ['winter', 'spring', 'summer', 'fall']
  const ai = Math.max(0, order.indexOf(active))
  const S = seasons.find((s) => s.id === active)
  const jump = (id: MwSeason) => document.getElementById(`season-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <div ref={root} className="mw-wheel-aside">
      <div className="mw-wheel">
        <div className="mw-wheel-turn" style={{ transform: `rotate(${-90 * ai}deg)` }}>
          <SeasonWheelSvg current={active} onSelect={jump} />
        </div>
        <span className="mw-wheel-pointer" aria-hidden />
        <div className="mw-wheel-center" aria-live="polite">
          <span className="mw-label">{String(ai + 1).padStart(2, '0')} / 04</span>
          <span className="mw-wheel-name">{S?.name}</span>
          <span className="mw-label">{S?.range}</span>
        </div>
      </div>
      <ol className="mw-wheel-list">
        {seasons.map((s) => (
          <li key={s.id}>
            <button type="button" aria-current={s.id === active ? 'true' : undefined} data-season-mark={s.id} onClick={() => jump(s.id)}>
              <span className="mw-wheel-chev" />
              <span className="mw-wheel-item">{s.name}</span>
              {s.arc && <span className="mw-label">{s.arc.split(' and ')[0]}</span>}
            </button>
          </li>
        ))}
      </ol>
      {calendarHref && (
        <a href={calendarHref} className="mw-textlink">
          Yearly calendar
        </a>
      )}
    </div>
  )
}

/** The season wheel: four octagon segments, the current one in its season color. */
function SeasonWheelSvg({ current, onSelect, size = 280 }: { current: MwSeason; onSelect: (s: MwSeason) => void; size?: number }) {
  const c = size / 2
  const R = c - 2
  const r = R * (1 - 0.32)
  const M = Math.cos(Math.PI / 8)
  const pt = (rad: number, a: number) => `${(c + rad * Math.cos((a * Math.PI) / 180)).toFixed(2)},${(c + rad * Math.sin((a * Math.PI) / 180)).toFixed(2)}`
  const order: MwSeason[] = ['winter', 'spring', 'summer', 'fall']
  const gap = Math.max(2, size * 0.012)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mw-wheel-svg" role="img" aria-label="The four seasons">
      {order.map((s, i) => {
        const a0 = -135 + 90 * i
        const P = [pt(R * M, a0), pt(R, a0 + 22.5), pt(R, a0 + 67.5), pt(R * M, a0 + 90), pt(r * M, a0 + 90), pt(r, a0 + 67.5), pt(r, a0 + 22.5), pt(r * M, a0)].join(' ')
        return (
          <polygon key={s} points={P} data-season-mark={s} data-on={s === current ? '' : undefined} strokeWidth={gap} onClick={() => onSelect(s)}>
            <title>{s}</title>
          </polygon>
        )
      })}
    </svg>
  )
}
