'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { claimSideQuestAction } from './actions'

// The "Mark done" control for a Side Quest. Honor-system claim: the member finished the mission in
// the world and marks it complete, unlocking the badge + bonus Zaps once. Optimistic done-state.
export function ClaimButton({ achievementId, claimed, zaps }: { achievementId: string; claimed: boolean; zaps: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [done, setDone] = useState(claimed)
  const [error, setError] = useState<string | null>(null)

  if (done) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-3 py-1.5 text-sm font-semibold text-success">
        <Check className="h-4 w-4" aria-hidden /> Done
      </span>
    )
  }

  const claim = () => {
    setError(null)
    start(async () => {
      const res = await claimSideQuestAction(achievementId)
      if (isError(res)) setError(res.error)
      else {
        setDone(true)
        router.refresh()
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={claim}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Mark done{zaps > 0 ? ` · +${zaps} Zaps` : ''}
      </button>
      {error && <span className="text-2xs text-danger">{error}</span>}
    </div>
  )
}
