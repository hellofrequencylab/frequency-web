'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, ArrowDown, Loader2 } from 'lucide-react'
import { toggleCrewRole } from './actions'
import { isError } from '@/lib/action-result'

export function UpgradeToggle({ isCrew }: { isCrew: boolean }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleToggle() {
    startTransition(async () => {
      const result = await toggleCrewRole()
      if (!isError(result)) {
        router.refresh()
      }
    })
  }

  if (isCrew) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl bg-success-bg/30 border border-success/50 px-4 py-3 text-center">
          <p className="text-sm font-semibold text-success flex items-center justify-center gap-2">
            <Zap className="w-4 h-4" />
            You are a Crew member
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={isPending}
          className="flex items-center justify-center gap-2 w-full rounded-xl border border-border px-4 py-3 text-sm font-medium text-muted hover:text-text hover:bg-surface-elevated transition-colors disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ArrowDown className="w-4 h-4" />
          )}
          Switch back to Member
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className="flex items-center justify-center gap-2 w-full rounded-xl bg-primary px-4 py-3.5 text-sm font-bold text-on-primary hover:bg-primary transition-colors shadow-lg shadow-indigo-600/20 disabled:opacity-50"
    >
      {isPending ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Zap className="w-4 h-4" />
      )}
      {isPending ? 'Updating...' : 'Upgrade to Crew'}
    </button>
  )
}
