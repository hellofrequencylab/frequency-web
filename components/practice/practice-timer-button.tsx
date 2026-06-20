'use client'

// The practice-detail timer launch (WEBSITE-CHANGES-PLAN C.4 + C.8). A timed
// practice gets a "Practice" button that opens the right timer overlay PRE-SET to
// this practice + its length, in place (no route flash):
//   • timer_kind = 'mindless' -> useMindless().open({ practiceId })  (the On Air sit)
//   • timer_kind = 'movement' -> useMovement().open({ practiceId, mode })  (the Movement timer)
// A log-only practice (timer_kind 'none') skips this; its "Log practice" button is
// the action there. duration_min seeds both timers (loaded by the session data).

import { Play } from 'lucide-react'
import { useMindless } from '@/components/on-air/mindless'
import { useMovement } from '@/components/on-air/movement'
import type { TimerKind } from '@/lib/practices'
import type { MovementMode } from '@/lib/movement'

export function PracticeTimerButton({
  practiceId,
  timerKind,
  movementMode,
}: {
  practiceId: string
  /** Which timer to route to. Defaults to 'mindless' for back-compat with callers
   *  that haven't passed it yet (the prior always-Mindless behavior). */
  timerKind?: TimerKind
  /** The Movement mode to open on, from the practice's movement_config. */
  movementMode?: MovementMode | null
}) {
  const mindless = useMindless()
  const movement = useMovement()
  const isMovement = timerKind === 'movement'
  const onClick = () =>
    isMovement
      ? movement.open({ practiceId, mode: movementMode ?? undefined })
      : mindless.open({ practiceId })
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
    >
      <Play className="h-3.5 w-3.5 shrink-0" aria-hidden /> Practice
    </button>
  )
}
