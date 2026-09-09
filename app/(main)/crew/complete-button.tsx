'use client'

import { useTransition } from 'react'
import { CheckCircle, Loader2, RotateCcw } from 'lucide-react'
import { logCompletion } from './actions'
import { useAchievementCheck } from '@/lib/use-achievement-check'

interface CompleteButtonProps {
  taskId: string
  isDone: boolean
  isRepeatable: boolean
  requiresVerification: boolean
}

// 🔴 MARKING A TASK COMPLETE IS OPEN TO EVERY SIGNED-IN MEMBER (owner ruling 2026-09-09, ADR-1295).
// It used to be Crew-gated, which left the earning side of the Quest shut while OWN-071 opened the
// spending side: a member could be shown a Vault they could spend in, and no way to earn for it.
// The Quest is the thing we all do together, so both halves are open. Do not re-add a tier check.
export function CompleteButton({ taskId, isDone, isRepeatable, requiresVerification }: CompleteButtonProps) {
  const [isPending, startTransition] = useTransition()
  const { checkForUnlocks } = useAchievementCheck()

  // Non-repeatable + already done. Show static state
  if (isDone && !isRepeatable) {
    return null
  }

  const label = requiresVerification
    ? isDone ? 'Submit again' : 'Submit for review'
    : isDone ? 'Log again' : 'Mark complete'

  function handleClick() {
    startTransition(async () => {
      await logCompletion(taskId)
      checkForUnlocks()
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className={`shrink-0 flex min-h-11 items-center gap-1 rounded-control px-3 py-1 text-meta font-semibold transition-colors disabled:opacity-50 motion-reduce:transition-none ${
        isDone
          ? 'bg-surface-elevated text-muted hover:bg-border-strong hover:text-text'
          : 'bg-primary text-on-primary hover:bg-primary-hover'
      }`}
    >
      {isPending ? (
        <Loader2 className="w-3 h-3 animate-spin motion-reduce:animate-none" />
      ) : isDone ? (
        <RotateCcw className="w-3 h-3" />
      ) : (
        <CheckCircle className="w-3 h-3" />
      )}
      {label}
    </button>
  )
}
