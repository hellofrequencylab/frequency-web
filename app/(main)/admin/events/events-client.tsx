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
          ? 'border-success text-success hover:bg-success-bg dark:hover:bg-success-bg/30'
          : 'border-danger text-danger hover:bg-danger-bg'
      }`}
    >
      {isPending ? '…' : isCancelled ? 'Reinstate' : 'Cancel'}
    </button>
  )
}
