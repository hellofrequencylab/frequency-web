'use client'

import { useEffect, useState } from 'react'

// A compact, quiet countdown to a future season start, shown inline beside the Season Map title
// while the season is live-but-not-yet-begun. Renders the date alone on the server / first paint
// (no clock read, so no hydration mismatch), then ticks down once mounted. Kept deliberately
// understated so the card stays compact.

function compact(ms: number): string {
  const d = Math.floor(ms / 86_400_000)
  const h = Math.floor((ms % 86_400_000) / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${s}s`
  return `${m}m ${s}s`
}

export function SeasonCountdown({ startMs, label }: { startMs: number; label: string | null }) {
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, startMs - Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startMs])

  return (
    <span className="inline-flex items-center gap-1.5 text-2xs font-medium text-subtle">
      <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" aria-hidden />
      Starts {label ?? 'soon'}
      {remaining !== null && <span className="tabular-nums text-muted">· {compact(remaining)}</span>}
    </span>
  )
}
