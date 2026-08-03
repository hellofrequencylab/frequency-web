'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { leaveJourneyAction } from '@/app/(main)/journeys/actions'

// Leave this Journey — the quiet exit at the foot of the learner player (adoption-lifecycle
// Phase 0). Two-tap confirm inline (no modal): first tap arms it, second tap leaves. Leaving
// deactivates the plan adoption and removes the unfinished enrollment; the member's adopted
// practices stay theirs. Copy is plain and does not narrate feelings (CONTENT-VOICE §10).
export function LeaveJourneyButton({ planId, journeyTitle }: { planId: string; journeyTitle: string }) {
  const [armed, setArmed] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const leave = () => {
    startTransition(async () => {
      const res = await leaveJourneyAction(planId)
      if (!isError(res)) router.push('/journeys')
    })
  }

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-text"
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden />
        Leave this Journey
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="text-muted">
        Leave {journeyTitle}? Your practices stay yours. Your lesson progress is kept if you come back.
      </span>
      <button
        type="button"
        onClick={leave}
        disabled={pending}
        className="font-semibold text-danger transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        {pending ? 'Leaving…' : 'Yes, leave'}
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        disabled={pending}
        className="text-muted transition-colors hover:text-text"
      >
        Keep going
      </button>
    </div>
  )
}
