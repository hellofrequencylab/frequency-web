'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, ArrowDown, Loader2 } from 'lucide-react'
import { toggleCrewRole } from './actions'

export function UpgradeToggle({ isCrew }: { isCrew: boolean }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleToggle() {
    startTransition(async () => {
      const result = await toggleCrewRole()
      if (!result.error) {
        router.refresh()
      }
    })
  }

  if (isCrew) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50 px-4 py-3 text-center">
          <p className="text-sm font-semibold text-green-700 dark:text-green-400 flex items-center justify-center gap-2">
            <Zap className="w-4 h-4" />
            You are a Crew member
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={isPending}
          className="flex items-center justify-center gap-2 w-full rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
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
      className="flex items-center justify-center gap-2 w-full rounded-xl bg-indigo-600 px-4 py-3.5 text-sm font-bold text-white hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-600/20 disabled:opacity-50"
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
