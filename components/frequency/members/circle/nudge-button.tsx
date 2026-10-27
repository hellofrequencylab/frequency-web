'use client'

import { useState, useTransition } from 'react'
import { isError } from '@/lib/action-result'
import { nudgeStreakMate } from '@/app/(main)/crew/leaderboard/streak-actions'
import { FqIcon } from '@/components/frequency/icon'
import { fqToast } from '@/components/frequency/members/shell/toast'

// The one-tap streak nudge on the Circle's Members tab, in the kit. Same action as the Consistency
// module's button (nudgeStreakMate re-resolves the nudger from the session and refuses unless the two
// share an active Circle; one nudge per pair per day). A sent nudge collapses to a "Nudged" mark.
export function FqNudgeButton({ mateProfileId, mateName }: { mateProfileId: string; mateName: string }) {
  const [pending, start] = useTransition()
  const [sent, setSent] = useState(false)
  if (sent) return <span className="t2 fqc-nudged">Nudged</span>
  return (
    <button
      type="button"
      className="btn sm"
      disabled={pending}
      aria-label={`Nudge ${mateName}`}
      onClick={() =>
        start(async () => {
          const res = await nudgeStreakMate(mateProfileId)
          if (isError(res)) {
            fqToast(res.error)
            return
          }
          setSent(true)
          fqToast(`Nudge sent to ${mateName.split(/\s+/)[0]}.`)
        })
      }
    >
      <FqIcon name="nudge" />
      Nudge
    </button>
  )
}
