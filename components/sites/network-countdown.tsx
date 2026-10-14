'use client'

import { useEffect, useState } from 'react'

// THE NETWORK COUNTDOWN (the handoff's "Up next" and PitchFest clocks): days, hours, minutes and seconds to a
// wall-clock start in the event's own zone. The server renders the parts at render time (a cached page may
// be minutes old), the island corrects them on mount and ticks once a second. Reduced motion changes
// nothing here: the digits update, nothing moves. Loaded only by the Network blocks.

/** The instant a wall clock (stored as UTC parts, lib/time/zone.ts) names in an IANA zone. */
export function wallClockInstant(wallIso: string, timeZone: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(wallIso)
  if (!m) return Number.NaN
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
  // The zone's offset at that moment, read back through Intl (DST-safe to the hour, which is all a clock needs).
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(asUtc))
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
    const seen = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'))
    return asUtc + (asUtc - seen)
  } catch {
    return asUtc
  }
}

export function countdownParts(target: number, now: number): [number, number, number, number] {
  const s = Math.max(0, Math.floor((target - now) / 1000))
  return [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60]
}

const pad = (n: number) => String(n).padStart(2, '0')
const UNITS = ['days', 'hrs', 'min', 'sec'] as const

export function NetworkCountdown({ startsAt, timeZone, initial, label }: { startsAt: string; timeZone: string; initial: [number, number, number, number]; label: string }) {
  const [parts, setParts] = useState(initial)
  useEffect(() => {
    const target = wallClockInstant(startsAt, timeZone)
    if (!Number.isFinite(target)) return
    const tick = () => setParts(countdownParts(target, Date.now()))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [startsAt, timeZone])
  return (
    <div className="nw-cd" role="timer" aria-label={label}>
      {parts.map((v, i) => (
        <div key={UNITS[i]}>
          <b>{pad(v)}</b>
          <span>{UNITS[i]}</span>
        </div>
      ))}
    </div>
  )
}
