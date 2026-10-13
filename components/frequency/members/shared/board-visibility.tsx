'use client'

import { useState, useTransition } from 'react'
import { setLeaderboardVisibility } from '@/app/(main)/crew/leaderboard/actions'
import { fqToast } from '../shell/toast'

// "Show me on leaderboards" as the kit's switch (.sw). The same server action the DAWN board's
// hide-me control calls; the preference is per MEMBER (profiles.meta.leaderboardOptOut), so it applies
// to every board at once. A refused write rolls the switch back and says so. Hidden members still
// count toward the shared goal.
export function BoardVisibilitySwitch({ hidden, label = 'Show me on leaderboards' }: { hidden: boolean; label?: string }) {
  const [shown, setShown] = useState(!hidden)
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={shown}
      aria-label={label}
      className={shown ? 'sw on' : 'sw'}
      disabled={pending}
      onClick={() => {
        const next = !shown
        setShown(next)
        start(async () => {
          const res = await setLeaderboardVisibility(!next)
          if (!res.ok) {
            setShown(!next)
            fqToast('That did not save. Try again.')
            return
          }
          fqToast(next ? 'You are back on the board.' : 'You are hidden from the board. You still count toward the shared goal.')
        })
      }}
    />
  )
}
