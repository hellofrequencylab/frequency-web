'use client'

import { useEffect } from 'react'
import { dailyCheckIn } from '@/app/(main)/checkin-actions'
import { showZapToast } from '@/components/zap-toast'

// Fires the once-a-day check-in on first load and (optionally) celebrates it. The reward is
// granted + guarded server-side (checkin-actions). The ACTION always fires — it pays the daily
// gems and ticks the visit streak; `celebrate` only controls the toast (the auto-popups flag),
// so turning popups off can never freeze the reward loop again.
//
// The celebration is a reward toast in THE lane (components/toast-lane.tsx, the kit Toast), not a
// box of its own. It used to be a hand-rolled pill fixed at top-20, centred, which sat on the
// Feed greeting, carried an emoji, and showed the VISIT streak ("Day 117") a few pixels above the
// PRACTICE streak the page calls "Day streak" (156): two numbers under one name. The toast no
// longer names a streak at all; the page already shows the real one. Going through showZapToast
// also records the reward as this tab's own, so its Realtime echo (components/reward-live.tsx)
// does not raise a second "+2 Gems" beside it.
export function DailyCheckIn({ celebrate = true }: { celebrate?: boolean }) {
  useEffect(() => {
    let live = true
    dailyCheckIn(Intl.DateTimeFormat().resolvedOptions().timeZone)
      .then((r) => {
        if (live && celebrate && r && r.gems > 0) {
          showZapToast({
            amount: r.gems,
            kind: 'gems',
            title: 'Welcome back',
            label: `+${r.gems} Gems for checking in today`,
          })
        }
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [celebrate])

  return null
}
