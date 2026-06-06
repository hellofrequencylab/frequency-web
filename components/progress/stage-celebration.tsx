'use client'

import { useEffect, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { acknowledgeStageAction } from '@/app/(main)/progress-actions'

// The "just unlocked" moment — shown once when a member crosses into a new stage.
// It acknowledges itself on mount (so it never re-fires), then sits as a warm,
// dismissible banner. Warmth, not confetti.
export function StageCelebration({
  stageIndex,
  stageLabel,
  tagline,
}: {
  stageIndex: number
  stageLabel: string
  tagline: string
}) {
  const [show, setShow] = useState(true)

  useEffect(() => {
    // Record that this stage has been seen so the celebration fires exactly once,
    // even if the member never dismisses it. Best-effort.
    void acknowledgeStageAction(stageIndex)
  }, [stageIndex])

  if (!show) return null

  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-primary bg-primary-bg/40 px-4 py-3">
      <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-primary-strong shadow-sm">
        <Sparkles className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-text">
          New stage reached: {stageLabel}
        </p>
        <p className="mt-0.5 text-xs text-muted">{tagline}</p>
      </div>
      <button
        type="button"
        onClick={() => setShow(false)}
        aria-label="Dismiss"
        className="shrink-0 rounded-md p-1 text-subtle transition-colors hover:bg-surface hover:text-text"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
