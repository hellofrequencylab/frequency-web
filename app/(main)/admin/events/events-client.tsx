'use client'

import { useState, useTransition } from 'react'
import { toggleCancelEvent } from '../actions'
import { DangerModal } from '@/components/admin/danger-modal'

export function CancelToggle({ id, isCancelled }: { id: string; isCancelled: boolean }) {
  const [isPending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)

  function commit() {
    startTransition(async () => {
      await toggleCancelEvent(id, !isCancelled)
    })
  }

  function handleClick() {
    // Reinstating is restorative — do it straight away. Cancelling notifies members,
    // so gate it behind the danger modal (named button, safe default).
    if (isCancelled) {
      commit()
      return
    }
    setConfirmOpen(true)
  }

  return (
    <>
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
      <DangerModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Cancel this event?"
        body="Members will see it as cancelled. You can reinstate it afterward."
        confirmLabel="Cancel event"
        onConfirm={commit}
      />
    </>
  )
}
