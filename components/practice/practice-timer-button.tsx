'use client'

// The practice-detail timer launch (WEBSITE-CHANGES-PLAN C.4 + C.8). A practice
// gets a button that opens the right timer overlay PRE-SET to this practice + its
// length, in place (no route flash):
//   • timer_kind = 'mindless' -> useMindless().open({ practiceId })  (the On Air sit)
//   • timer_kind = 'movement' -> useMovement().open({ practiceId, mode })  (the Movement timer)
//   • timer_kind = 'none'     -> useMindless().open({ practiceId }) too; the session
//        reads mindless_mode = 'log' and opens the Just Log screen + optional note.
// duration_min seeds both timers (loaded by the session data). Pass `resumeFromSec`
// + `secondsTarget` (from a partial log today) to resume in place: the label reads
// "Continue Practice" and the timer opens where the member left off.

import { Play } from 'lucide-react'
import { LotusIcon } from '@/components/on-air/icons'
import { useMindless } from '@/components/on-air/mindless'
import { useMovement } from '@/components/on-air/movement'
import type { TimerKind } from '@/lib/practices'
import type { MovementMode } from '@/lib/movement'

export function PracticeTimerButton({
  practiceId,
  timerKind,
  movementMode,
  resumeFromSec,
  secondsTarget,
}: {
  practiceId: string
  /** Which timer to route to. Defaults to 'mindless' for back-compat with callers
   *  that haven't passed it yet (the prior always-Mindless behavior). A 'none'
   *  practice opens the Just Log screen inside the Mindless session. */
  timerKind?: TimerKind
  /** The Movement mode to open on, from the practice's movement_config. */
  movementMode?: MovementMode | null
  /** Resume a PARTIAL log started today: open the timer where the member left off.
   *  When set (with secondsTarget), the label becomes "Continue Practice". */
  resumeFromSec?: number
  /** The target length of the partial sit, in seconds (paired with resumeFromSec). */
  secondsTarget?: number
}) {
  const mindless = useMindless()
  const movement = useMovement()
  const isMovement = timerKind === 'movement'
  const isResume = resumeFromSec != null && resumeFromSec > 0

  const onClick = () => {
    // The provider open() takes the agreed resume options (practiceId + mode +
    // resumeFromSec + secondsTarget); narrow to that shape at the call site.
    if (isMovement) {
      const opts: TimerResumeOptions = { practiceId, mode: movementMode ?? undefined }
      if (isResume) {
        opts.resumeFromSec = resumeFromSec
        opts.secondsTarget = secondsTarget
      }
      ;(movement.open as TimerOpen)(opts)
    } else {
      // 'mindless' AND 'none' both open the On Air sit; the session reads the
      // practice's mindless_mode ('none' carries 'log' → the Just Log screen).
      const opts: TimerResumeOptions = { practiceId }
      if (isResume) {
        opts.resumeFromSec = resumeFromSec
        opts.secondsTarget = secondsTarget
      }
      ;(mindless.open as TimerOpen)(opts)
    }
  }

  const Icon = isMovement ? Play : LotusIcon
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden /> {isResume ? 'Continue Practice' : 'Practice'}
    </button>
  )
}

// The agreed timer-launch contract (mindless + movement providers): open() takes the
// practice to log against, the Movement mode (movement only), and the optional resume
// pair for a "Finish Practice" sit. The providers accept this superset; this local
// shape lets the button pass the resume props type-safely from here.
type TimerResumeOptions = {
  practiceId: string
  mode?: MovementMode
  resumeFromSec?: number
  secondsTarget?: number
}
type TimerOpen = (opts: TimerResumeOptions) => void
