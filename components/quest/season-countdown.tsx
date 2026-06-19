'use client'

import { useEffect, useState } from 'react'

// A live countdown to a future season start, shown on the Season Map while the season is
// live-but-not-yet-begun. Renders the date alone on the server / first paint (no clock read,
// so no hydration mismatch), then ticks days/hours/minutes/seconds once mounted.

function breakdown(ms: number): { d: number; h: number; m: number; s: number } {
  return {
    d: Math.floor(ms / 86_400_000),
    h: Math.floor((ms % 86_400_000) / 3_600_000),
    m: Math.floor((ms % 3_600_000) / 60_000),
    s: Math.floor((ms % 60_000) / 1000),
  }
}

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-xl font-bold leading-none tabular-nums text-text">
        {String(value).padStart(2, '0')}
      </span>
      <span className="mt-1 text-3xs font-semibold uppercase tracking-widest text-subtle">{label}</span>
    </div>
  )
}

function Sep() {
  return <span className="text-lg font-bold leading-none text-border-strong" aria-hidden>:</span>
}

export function SeasonCountdown({ startMs, label }: { startMs: number; label: string | null }) {
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, startMs - Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startMs])

  const t = remaining === null ? null : breakdown(remaining)

  return (
    <div className="mt-4 flex flex-col items-center gap-2 px-6 sm:px-7">
      <p className="text-2xs font-semibold uppercase tracking-widest text-primary-strong">
        Season starts {label ?? 'soon'}
      </p>
      {t && (
        <div className="flex items-start gap-2.5" aria-label={`Starts in ${t.d} days, ${t.h} hours, ${t.m} minutes`}>
          <Unit value={t.d} label="days" />
          <Sep />
          <Unit value={t.h} label="hrs" />
          <Sep />
          <Unit value={t.m} label="min" />
          <Sep />
          <Unit value={t.s} label="sec" />
        </div>
      )}
    </div>
  )
}
