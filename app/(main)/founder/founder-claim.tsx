'use client'

import { useEffect, useState } from 'react'
import { Gem, Rocket } from 'lucide-react'
import { claimFounderRewards } from './founder-actions'

// Reconciles first-week rewards on view (idempotent server-side) and celebrates
// anything newly earned. Kept as a client child so the page itself stays a pure
// read — the mutation happens once, on mount.
export function FounderClaim() {
  const [earned, setEarned] = useState<{ gems: number; badge: boolean } | null>(null)

  useEffect(() => {
    let live = true
    claimFounderRewards().then((r) => {
      if (live && (r.gemsAwarded > 0 || r.badgeGranted)) {
        setEarned({ gems: r.gemsAwarded, badge: r.badgeGranted })
      }
    })
    return () => {
      live = false
    }
  }, [])

  if (!earned) return null

  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl border border-signal-strong/30 bg-signal-bg px-4 py-3">
      {earned.badge ? <Rocket className="h-5 w-5 shrink-0 text-signal" aria-hidden /> : <Gem className="h-5 w-5 shrink-0 text-signal" aria-hidden />}
      <p className="text-sm font-semibold text-signal">
        {earned.badge ? 'Founder’s First Week complete. Badge earned! ' : ''}
        {earned.gems > 0 && <>+{earned.gems} Gems banked.</>}
      </p>
    </div>
  )
}
