'use client'

import { useEffect, useState } from 'react'
import { countdownParts, wallClockInstant } from '@/lib/time/wall-clock'

// THE NETWORK COUNTDOWN (the handoff's "Up next" and PitchFest clocks): days, hours, minutes and seconds to a
// wall-clock start in the event's own zone. The server renders the parts at render time (a cached page may
// be minutes old), the island corrects them on mount and ticks once a second. Reduced motion changes
// nothing here: the digits update, nothing moves. Loaded only by the Network blocks. The clock math lives in
// lib/time/wall-clock.ts so the server can call it; nothing but the component is exported from here.

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
