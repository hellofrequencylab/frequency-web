'use client'

import { useTransition } from 'react'
import { toggleCancelEvent } from '../actions'

export function CancelToggle({ id, isCancelled }: { id: string; isCancelled: boolean }) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    if (!isCancelled && !confirm('Cancel this event? Members will see it as cancelled.')) return
    startTransition(async () => {
      await toggleCancelEvent(id, !isCancelled)
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
        isCancelled
          ? 'border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30'
          : 'border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30'
      }`}
    >
      {isPending ? '…' : isCancelled ? 'Reinstate' : 'Cancel'}
    </button>
  )
}
