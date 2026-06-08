'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Gift, Loader2, Check } from 'lucide-react'
import { runRetroRewards } from './actions'
import { isError } from '@/lib/action-result'

export function RunRewardsButton({ pending }: { pending: number }) {
  const [isPending, startTransition] = useTransition()
  const [granted, setGranted] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function run() {
    setError(null)
    startTransition(async () => {
      const r = await runRetroRewards()
      if (isError(r)) setError(r.error)
      else {
        setGranted(r.data.newGrants)
        router.refresh()
      }
    })
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={run}
        disabled={isPending || pending === 0}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
        {pending === 0 ? 'Nothing pending' : `Grant ${pending} pending reward${pending === 1 ? '' : 's'}`}
      </button>
      {granted != null && (
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-success">
          <Check className="h-4 w-4" /> Granted {granted}
        </span>
      )}
      {error && <span className="text-sm text-danger">{error}</span>}
    </div>
  )
}
