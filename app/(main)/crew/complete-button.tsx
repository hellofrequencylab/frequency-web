'use client'

import { useTransition } from 'react'
import { CheckCircle, Loader2, RotateCcw } from 'lucide-react'
import { logCompletion } from './actions'
import { CrewGateButton } from '@/components/crew-gate-button'
import { useAchievementCheck } from '@/lib/use-achievement-check'

interface CompleteButtonProps {
  taskId: string
  isDone: boolean
  isRepeatable: boolean
  requiresVerification: boolean
  isCrew: boolean
}

export function CompleteButton({ taskId, isDone, isRepeatable, requiresVerification, isCrew }: CompleteButtonProps) {
  const [isPending, startTransition] = useTransition()
  const { checkForUnlocks } = useAchievementCheck()

  // Non-repeatable + already done — show static state
  if (isDone && !isRepeatable) {
    return null
  }

  const label = requiresVerification
    ? isDone ? 'Submit again' : 'Submit for review'
    : isDone ? 'Log again' : 'Mark complete'

  if (!isCrew) {
    return (
      <CrewGateButton
        isCrew={false}
        label={label}
        buttonClassName="shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold bg-surface-elevated text-subtle hover:bg-primary-bg hover:text-primary-strong transition-colors"
      />
    )
  }

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
      className={`shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
        isDone
          ? 'bg-surface-elevated text-muted hover:bg-border-strong'
          : 'bg-primary text-on-primary hover:bg-primary-hover'
      }`}
    >
      {isPending ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : isDone ? (
        <RotateCcw className="w-3 h-3" />
      ) : (
        <CheckCircle className="w-3 h-3" />
      )}
      {label}
    </button>
  )
}
