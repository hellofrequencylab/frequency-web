'use client'

import { useEffect, useState } from 'react'
import { Gem, Flame } from 'lucide-react'
import { dailyCheckIn, type DailyCheckInResult } from '@/app/(main)/checkin-actions'

// Fires the once-a-day check-in on first load and (optionally) celebrates it. The reward is
// granted + guarded server-side (checkin-actions). The ACTION always fires — it pays the daily
// gems and ticks the visit streak; `celebrate` only controls the toast (the auto-popups flag),
// so turning popups off can never freeze the reward loop again.
export function DailyCheckIn({ celebrate = true }: { celebrate?: boolean }) {
  const [res, setRes] = useState<DailyCheckInResult | null>(null)

  useEffect(() => {
    let live = true
    dailyCheckIn(Intl.DateTimeFormat().resolvedOptions().timeZone)
      .then((r) => {
        if (live && celebrate && r && r.gems > 0) {
          setRes(r)
          setTimeout(() => {
            if (live) setRes(null)
          }, 5000)
        }
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [celebrate])

  if (!res) return null

  return (
    <div className="fixed left-1/2 top-20 z-[60] -translate-x-1/2 motion-safe:animate-[slideUp_0.25s_ease-out]">
      <div className="flex items-center gap-2.5 rounded-full border border-border bg-surface px-4 py-2 text-sm font-semibold text-text shadow-pop">
        👋 Welcome back
        <span className="inline-flex items-center gap-1 text-primary-strong">
          <Flame className="h-4 w-4" aria-hidden /> Day {res.dayStreak}
        </span>
        <span className="inline-flex items-center gap-1 text-signal">
          <Gem className="h-4 w-4" aria-hidden /> +{res.gems}
        </span>
      </div>
    </div>
  )
}
