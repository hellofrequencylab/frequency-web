'use client'

// Claim / release controls for a circle-scoped crew task (BUILD-LIST P4.7).
// Rendered ONLY when the server already resolved the matching capability
// (task.claim / claimer-self / circle.assignTask) — the actions re-check
// regardless, so a stale button just gets a friendly error back.

import { useState, useTransition } from 'react'
import { Hand, Loader2, Undo2 } from 'lucide-react'
import { claimCircleTask, releaseCircleTask } from './circle-task-actions'

export function ClaimTaskButton({ taskId }: { taskId: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const res = await claimCircleTask(taskId)
      if (!res.ok && res.error) setError(res.error)
    })
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={isPending}
        className="shrink-0 flex min-h-11 items-center gap-1 rounded-lg px-3 py-1 text-xs font-semibold bg-primary text-on-primary hover:bg-primary-hover transition-colors disabled:opacity-50 motion-reduce:transition-none"
      >
        {isPending ? <Loader2 className="w-3 h-3 animate-spin motion-reduce:animate-none" /> : <Hand className="w-3 h-3" />}
        Claim
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  )
}

export function ReleaseTaskButton({ taskId }: { taskId: string }) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      await releaseCircleTask(taskId)
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="shrink-0 flex min-h-11 items-center gap-1 rounded-lg px-3 py-1 text-xs font-semibold bg-surface-elevated text-muted hover:bg-border-strong transition-colors disabled:opacity-50 motion-reduce:transition-none"
    >
      {isPending ? <Loader2 className="w-3 h-3 animate-spin motion-reduce:animate-none" /> : <Undo2 className="w-3 h-3" />}
      Release
    </button>
  )
}
