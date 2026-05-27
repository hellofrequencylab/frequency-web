'use client'

import { useTransition } from 'react'
import { CheckCircle, Loader2, RotateCcw } from 'lucide-react'
import { logCompletion } from './actions'
import { CrewGateButton } from '@/components/crew-gate-button'

interface CompleteButtonProps {
  taskId: string
  isDone: boolean
  isRepeatable: boolean
  requiresVerification: boolean
  isCrew: boolean
}

export function CompleteButton({ taskId, isDone, isRepeatable, requiresVerification, isCrew }: CompleteButtonProps) {
  const [isPending, startTransition] = useTransition()

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
        buttonClassName="shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
      />
    )
  }

  function handleClick() {
    startTransition(async () => {
      await logCompletion(taskId)
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className={`shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
        isDone
          ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
          : 'bg-indigo-600 text-white hover:bg-indigo-700'
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
