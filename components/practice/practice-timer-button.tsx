'use client'

// The practice-detail timer launch (WEBSITE-CHANGES-PLAN C.4). A timed practice
// gets a "Practice" button that opens the Mindless (On Air) overlay PRE-SET to
// this practice and its length — the same useMindless().open({ practiceId })
// path the Journey step uses (components/journey/v2/learn/practice-actions.tsx),
// so logging/starting a timed practice runs the real timer in place, no route
// flash. A log-only practice (no timer) skips this; its "Log practice" button is
// the action there.

import { Play } from 'lucide-react'
import { useMindless } from '@/components/on-air/mindless'

export function PracticeTimerButton({ practiceId }: { practiceId: string }) {
  const { open } = useMindless()
  return (
    <button
      type="button"
      onClick={() => open({ practiceId })}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
    >
      <Play className="h-3.5 w-3.5 shrink-0" aria-hidden /> Practice
    </button>
  )
}
