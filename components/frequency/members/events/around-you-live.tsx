'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { FqIcon } from '@/components/frequency/icon'
import type { AyItem, AyTab, AyTabKey } from './around-you-items'

// THE LIVE PARTS OF AROUND YOU (SCAN-975): the pulse strip, the ticker and the spotlight's countdown. All
// three only re-read the clock; every row, label and link arrived from the server (around-you-items.ts).
//
// HYDRATION. The first paint has no clock (`now` is null), so the server and the browser draw the same
// static when-lines; the live signals ("in 2h 10m", "Live now", "3 left") arrive after mount and refresh
// every half minute. A reduced-motion member gets the strip as a still, scrollable row.

const TICK_MS = 30_000

function useNow(): number | null {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const read = () => setNow(Date.now())
    read()
    const t = window.setInterval(read, TICK_MS)
    return () => window.clearInterval(t)
  }, [])
  return now
}

/** Is it running right now? */
function ayLive(i: Pick<AyItem, 'startMs' | 'endMs'>, now: number): boolean {
  return i.startMs != null && i.endMs != null && i.startMs <= now && now < i.endMs
}

type Signal = { text: string; tone: 'live' | 'soon' | 'warm' }

function untilLabel(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60_000))
  if (mins < 60) return `in ${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `in ${h}h` : `in ${h}h ${m}m`
}

/** The one live signal a row can carry right now, most urgent first. */
function signalFor(i: AyItem, now: number | null): Signal | null {
  if (now == null) return null
  if (ayLive(i, now)) return { text: 'Live now', tone: 'live' }
  if (i.startMs != null) {
    const ahead = i.startMs - now
    if (ahead > 0 && ahead <= 12 * 60 * 60 * 1000) return { text: `Starts ${untilLabel(ahead)}`, tone: 'soon' }
  }
  if (i.spotsLeft != null && i.spotsLeft > 0 && i.spotsLeft <= 5)
    return { text: i.spotsLeft === 1 ? '1 spot left' : `${i.spotsLeft} spots left`, tone: 'warm' }
  return null
}

/** The spotlight's countdown line: "Starts in 2h 10m", "Live now", or the plain when-line until mount. */
export function AyCountdown({ item }: { item: AyItem }) {
  const now = useNow()
  const s = signalFor(item, now)
  if (!s || s.tone === 'warm') return <span className="ay-when">{item.when}</span>
  return (
    <span className={`ay-when ${s.tone}`}>
      {s.tone === 'live' && <span className="dot fq-breathe" aria-hidden="true" />}
      {s.text}
      <span className="ay-when-sub">{item.when}</span>
    </span>
  )
}

/** The pulse: one quiet scrolling strip of what is live, starting soon, filling up or featured this week. */
export function AyPulse({ items }: { items: AyItem[] }) {
  const now = useNow()
  const rows = items
    .map((i) => ({ i, s: signalFor(i, now) ?? (i.featured ? ({ text: 'Featured', tone: 'soon' } as Signal) : null) }))
    .filter((r): r is { i: AyItem; s: Signal } => r.s !== null)
  if (rows.length === 0) return null
  const strip = (hidden: boolean) => (
    <ul className="ay-pulse-row" aria-hidden={hidden || undefined}>
      {rows.map(({ i, s }) => (
        <li key={i.id}>
          <Link href={`/events/${i.slug}`} tabIndex={hidden ? -1 : undefined}>
            <span className={`ay-sig ${s.tone}`}>{s.text}</span>
            <b>{i.title}</b>
            <span className="t2">{i.day} {i.time}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
  return (
    <div className={rows.length > 2 ? 'ay-pulse moving' : 'ay-pulse'} role="region" aria-label="Happening soon">
      <span className="ay-pulse-k">
        <span className="dot fq-breathe" aria-hidden="true" />
        Pulse
      </span>
      <div className="ay-pulse-track">
        {strip(false)}
        {rows.length > 2 && strip(true)}
      </div>
    </div>
  )
}

/** The ticker: four lenses on what is around you, each a short live list. */
export function AyTicker({ tabs, defaultTab }: { tabs: AyTab[]; defaultTab: AyTabKey }) {
  const now = useNow()
  const [on, setOn] = useState<AyTabKey>(defaultTab)
  const tab = tabs.find((t) => t.key === on) ?? tabs[0]
  return (
    <div className="ay-ticker panel">
      <div className="ay-tabs" role="tablist" aria-label="Around you">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`ay-tab-${t.key}`}
            aria-selected={t.key === tab.key}
            aria-controls="ay-tab-panel"
            className={t.key === tab.key ? 'on' : undefined}
            onClick={() => setOn(t.key)}
          >
            {t.label}
            <span className="ev-n-tag">{t.items.length}</span>
          </button>
        ))}
      </div>
      <ol className="ay-list" id="ay-tab-panel" role="tabpanel" aria-labelledby={`ay-tab-${tab.key}`}>
        {tab.items.map((i) => {
          const s = signalFor(i, now)
          return (
            <li key={i.id}>
              <Link href={`/events/${i.slug}`}>
                <span className="ay-day">
                  <b>{i.day}</b>
                  <i>{i.time}</i>
                </span>
                <span className="ay-row-b">
                  <span className="ay-row-t">{i.title}</span>
                  <span className="t2">
                    {[
                      i.going ? 'Going' : null,
                      tab.key === 'near' && i.miles != null ? `${i.miles} mi` : i.place,
                      i.goingCount > 0 ? `${i.goingCount} going` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                {s ? (
                  <span className={`ay-sig ${s.tone}`}>{s.text}</span>
                ) : (
                  <FqIcon name="chevron" className="ay-go" />
                )}
              </Link>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
