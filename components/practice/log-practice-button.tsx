'use client'

import { useState, useTransition } from 'react'
import { Check, Timer } from 'lucide-react'
import { logPracticeAction } from '@/app/(main)/practices/actions'
import { isError } from '@/lib/action-result'
import { showZapToast } from '@/components/zap-toast'
import { useMindless } from '@/components/on-air/mindless'
import { useMovement } from '@/components/on-air/movement'
import type { TimerKind, MindlessMode } from '@/lib/practices'
import type { MovementConfig } from '@/lib/movement'

// Log a practice → practice.verified (the North-Star event) + zaps + streak.
// Idempotent per practice per day; shows a "Logged today" state after success.
//
// TWO modes, picked by whether a `timerKind` is passed:
//
//   • No timerKind (the original path) → the one-tap server log. Idempotent per
//     practice per day; paints "Logged today" after success. Every existing caller
//     (the practices row, circle page, row-card) keeps this behavior untouched.
//   • A timerKind → the smart action: the button OPENS the right timer/sheet
//     pre-set to this practice instead of logging in place, since a timed practice
//     is finished inside its session, not by a tap (WEBSITE-CHANGES-PLAN §4 C.8):
//       - 'movement' → useMovement().open (the Movement timer, seeded to its mode)
//       - 'mindless' → useMindless().open (the On Air sit, seeded to its mindless_mode)
//       - 'none'     → useMindless().open too; the session detects mindless_mode='log'
//                      and opens the Just Log screen + optional note.
//     Pass `resumeFromSec` + `secondsTarget` (from a partial log today) to resume:
//     the row reads "Continue Practice" and the timer opens where the member left off.
//
// Seed `initialLogged` from the server (getPracticeMemberState().loggedToday /
// getPracticesToLogToday) so a practice already logged today paints in the logged
// state on first render, never showing the button. `onLogged` lets a parent row
// collapse itself after a successful log (the "your practices" tight row uses it).
export function LogPracticeButton({
  practiceId,
  circleId,
  label,
  initialLogged = false,
  onLogged,
  timerKind,
  movementConfig,
  resumeFromSec,
  secondsTarget,
}: {
  practiceId: string
  circleId?: string
  label?: string
  /** Seed the logged-today state from the server (no button on first paint). */
  initialLogged?: boolean
  /** Fired after a successful log, so a parent can collapse the row. */
  onLogged?: () => void
  /** Which timer the practice routes to. Omit for the plain one-tap log (back-compat).
   *  When set, the button opens the matching timer/sheet instead of logging in place. */
  timerKind?: TimerKind
  /** The mindless flavour, for a timer_kind = 'mindless' practice. Accepted for back-compat but
   *  NOT forwarded: the session derives the flavour from the practice itself, so it is advisory
   *  only (the provider's open() has no mindlessMode option — passing it here was a no-op). */
  mindlessMode?: MindlessMode | null
  /** The Movement config, for a timer_kind = 'movement' practice; its `mode` opens the timer. */
  movementConfig?: MovementConfig | null
  /** Resume a PARTIAL log started today: open the timer where the member left off.
   *  When set (with secondsTarget), the label becomes "Continue Practice". */
  resumeFromSec?: number
  /** The target length of the partial sit, in seconds (paired with resumeFromSec). */
  secondsTarget?: number
}) {
  const [done, setDone] = useState(initialLogged)
  const [pending, start] = useTransition()
  const mindless = useMindless()
  const movement = useMovement()

  const isTimer = timerKind != null
  const isResume = resumeFromSec != null && resumeFromSec > 0
  // A timed practice leads with "Start Practice" (a partial reads "Continue Practice"); a
  // no-timer practice is a one-tap check-off ("Log it"). An explicit `label` overrides both.
  const timedLabel = label ?? (isResume ? 'Continue Practice' : 'Start Practice')
  const logLabel = label ?? 'Log it'

  // A partial today IS technically logged, but the affordance the member wants is "Continue
  // Practice" (resume the timer for the rest), not the collapsed "Logged today" line. So a
  // resume always wins over the logged-state collapse below.
  if (done && !isResume) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-success-bg text-success px-3 py-1.5 text-sm font-semibold">
        <Check className="w-4 h-4" /> Logged today
      </span>
    )
  }

  // Timed mode: open the matching timer/sheet (resuming from a partial when asked).
  // The provider's open() takes the agreed resume options (practiceId + resumeFromSec
  // + secondsTarget); narrow to that shape at the call site.
  if (isTimer) {
    const openTimer = () => {
      if (timerKind === 'movement') {
        // autoStart: selecting a practice opens the timer and begins the countdown immediately.
        const opts: TimerResumeOptions = { practiceId, mode: movementConfig?.mode, autoStart: true }
        if (isResume) {
          opts.resumeFromSec = resumeFromSec
          opts.secondsTarget = secondsTarget
        }
        ;(movement.open as TimerOpen)(opts)
      } else {
        // 'mindless' AND 'none' both go to the On Air sit; the session derives the
        // real flavour from the practice's mindless_mode (a 'none' practice carries
        // 'log' → the Just Log screen), so no mindlessMode is forwarded here.
        const opts: TimerResumeOptions = { practiceId, autoStart: true }
        if (isResume) {
          opts.resumeFromSec = resumeFromSec
          opts.secondsTarget = secondsTarget
        }
        ;(mindless.open as TimerOpen)(opts)
      }
    }
    // A timed practice always shows the timer icon + "Start Practice" (a resume reads
    // "Continue Practice"), matching PracticeTimerButton so the two never diverge.
    return (
      <button
        type="button"
        onClick={openTimer}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary hover:bg-primary-hover text-on-primary px-3 py-1.5 text-sm font-semibold transition-colors"
      >
        <Timer className="w-4 h-4" /> {timedLabel}
      </button>
    )
  }

  // Plain one-tap mode (unchanged): the server log, idempotent per practice per day.
  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          // Pass the browser's IANA tz as a FALLBACK so a member with no stored
          // home_timezone still logs against THEIR local day, not UTC. The server
          // prefers home_timezone, so this can't be used to backdate.
          const tz = (() => {
            try {
              return Intl.DateTimeFormat().resolvedOptions().timeZone || null
            } catch {
              return null
            }
          })()
          const res = await logPracticeAction(practiceId, circleId, tz)
          if (!isError(res)) {
            setDone(true)
            onLogged?.()
            if (res.data.logged && res.data.zapsAwarded) {
              // Welcome Back: the warm re-entry line — good to see you + one small
              // next step. NEVER broken-streak shame UI on this path.
              const toastLabel = res.data.welcomeBack
                ? 'Good to see you. One practice at a time.'
                : 'Practice logged'
              showZapToast({ amount: res.data.zapsAwarded, label: toastLabel })
            }
          }
        })
      }
      className="inline-flex items-center gap-1.5 rounded-lg bg-primary hover:bg-primary-hover text-on-primary px-3 py-1.5 text-sm font-semibold disabled:opacity-60 transition-colors"
    >
      <Check className="w-4 h-4" strokeWidth={2.5} />
      {pending ? 'Logging…' : logLabel}
    </button>
  )
}

// The agreed timer-launch contract (mindless + movement providers): open() takes the
// practice to log against, the Movement mode (movement only), and the optional resume
// pair for a "Finish Practice" sit. The providers accept this superset; this local
// shape lets the smart button pass the resume props type-safely from here.
type TimerResumeOptions = {
  practiceId: string
  mode?: MovementConfig['mode']
  resumeFromSec?: number
  secondsTarget?: number
  autoStart?: boolean
}
type TimerOpen = (opts: TimerResumeOptions) => void
