'use client'

import { useEffect, useState } from 'react'
import { Flame } from 'lucide-react'

// Member-facing season banner with a live countdown (DEVELOPMENT-MAP Stage A —
// reward economy). Fed the active season by the server; the absolute end date
// is preformatted server-side (no locale/timezone hydration mismatch), and the
// relative "Nd Nh left" is computed after mount only.

function remainingLabel(endMs: number, nowMs: number): string {
  const ms = endMs - nowMs
  if (ms <= 0) return 'ending now'
  const mins = Math.floor(ms / 60000)
  const days = Math.floor(mins / 1440)
  const hours = Math.floor((mins % 1440) / 60)
  if (days > 0) return `${days}d ${hours}h left`
  const minutes = mins % 60
  if (hours > 0) return `${hours}h ${minutes}m left`
  return `${minutes}m left`
}

export function SeasonBanner({
  seasonNumber,
  name,
  theme,
  endsAt,
  endsLabel,
}: {
  seasonNumber: number
  name: string
  theme: string | null
  endsAt: string | null
  endsLabel: string | null
}) {
  // null until mounted → identical server/client first paint (no countdown SSR).
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setNow(Date.now())
    // First paint stays server-identical (now=null); seed the countdown on the
    // next macrotask (async setState, not synchronous-in-effect), then tick.
    const seed = setTimeout(tick, 0)
    const iv = setInterval(tick, 60_000)
    return () => {
      clearTimeout(seed)
      clearInterval(iv)
    }
  }, [])

  const endMs = endsAt ? new Date(endsAt).getTime() : null
  const countdown = endMs !== null && now !== null ? remainingLabel(endMs, now) : null

  return (
    <div className="mb-6 flex items-center gap-4 rounded-2xl border border-primary-bg bg-primary-bg/60 px-5 py-3.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary">
        <Flame className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-2xs font-bold uppercase tracking-widest text-primary-strong">
          Season {seasonNumber}
        </p>
        <p className="truncate text-base font-semibold text-text">
          {name}
          {theme && <span className="font-normal text-muted"> · {theme}</span>}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {endsLabel ? (
          <>
            <p className="text-sm font-semibold text-text">{countdown ?? `Ends ${endsLabel}`}</p>
            <p className="text-2xs text-subtle">Ends {endsLabel}</p>
          </>
        ) : (
          <p className="text-sm font-medium text-subtle">Ongoing</p>
        )}
      </div>
    </div>
  )
}
