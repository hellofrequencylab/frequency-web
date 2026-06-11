'use client'

import { useEffect, useState } from 'react'

// Data-freshness cue (ADR-233 §4, the cheapest highest-leverage trust mechanism). A
// quiet "Updated {relative}" footnote on a data tile/section; flips to a warning token
// once the data is older than its SLA, so operators never act on stale numbers without
// knowing. Client component: it reads the clock in an effect (never during render, per
// the repo's react-hooks/purity lint) and refreshes the relative label each minute.
//
//   <FreshnessNote at={lastSyncedAt} sla={60} />   // warns once >60 min old

function relative(fromMs: number, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - fromMs) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return `${d}d ago`
}

export function FreshnessNote({
  at,
  sla,
  label = 'Updated',
}: {
  at: Date | string | number
  /** Minutes after which the note flips to a warning tone. */
  sla?: number
  label?: string
}) {
  const fromMs = new Date(at).getTime()
  const [nowMs, setNowMs] = useState<number | null>(null)

  useEffect(() => {
    // Client-only clock read (render stays pure per react-hooks/purity); refresh hourly
    // granularity each minute.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNowMs(Date.now())
    const id = setInterval(() => setNowMs(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Render a stable placeholder until the clock is read on the client (avoids hydration
  // mismatch and the render-time clock read).
  const text = nowMs === null ? '' : relative(fromMs, nowMs)
  const stale = nowMs !== null && sla !== undefined && nowMs - fromMs > sla * 60_000

  return (
    <span className={`text-xs ${stale ? 'font-medium text-warning' : 'text-subtle'}`} suppressHydrationWarning>
      {label} {text}
    </span>
  )
}
