'use client'

// Journeys v2 — the per-step PRACTICE action for the learn player. On a `practice` step (a lesson
// backed by a library practice), the follower gets ONE clear, practice-specific action, chosen by
// the practice's own type (the author's "How it's done" toggle, ADR-253):
//   • Timer practice (a sit, breathwork) → "Practice" opens the Mindless timer overlay pre-set to
//     this practice (the global useMindless hook; no navigation, the follower stays in the lesson).
//     A note sets the expectation: run the full timer so it counts.
//   • Log it practice (an action, a reflection) → "Log it" records the practice (Zaps + streak tick)
//     via logPracticeAction, with a pending state and a brief "Logged" confirmation.
// Either way, logging clears the step's "Mark complete & continue" gate (the player reads it back
// via router.refresh + the optimistic onLogged). Client-only; token colors, voice canon, no em dashes.

import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Timer } from 'lucide-react'
import { useMindless } from '@/components/on-air/mindless'
import { useMovement } from '@/components/on-air/movement'
import { logPracticeAction } from '@/app/(main)/practices/actions'
import { isError } from '@/lib/action-result'
import type { MovementMode } from '@/lib/movement'
import type { PartialToday } from '@/lib/practices'

/** How long the "Logged" confirmation lingers before the button resets to rest. */
const CONFIRM_MS = 4000

export function PracticeActions({
  practiceId,
  /** Timer practice → "Practice" (opens a timer); Log it practice → "Log it" (records it). */
  usesTimer,
  /** When set, "Practice" opens the Movement timer on this mode instead of the Mindless sit. */
  movementMode,
  /** The step's Pillar name, when known — used only to colour the confirmation copy naturally. */
  pillar,
  /** Already logged today (server truth) — a Log it practice rests in its "Logged" state. */
  logged = false,
  /** A banked-but-unfinished log today on a TIMER practice → "Practice" becomes "Continue
   *  Practice" and resumes the timer for the remaining time. */
  partialToday,
  /** Fired after a successful Log it, so the player can clear the completion gate optimistically. */
  onLogged,
  /** Compact variant for tight rows (the syllabus); default is the roomy lesson-pane button. */
  compact = false,
}: {
  practiceId: string
  usesTimer: boolean
  movementMode?: MovementMode | null
  pillar?: string
  logged?: boolean
  partialToday?: PartialToday | null
  onLogged?: (practiceId: string) => void
  compact?: boolean
}) {
  const router = useRouter()
  const mindless = useMindless()
  const movement = useMovement()
  // A partial today resumes the timer for the rest (the unified resume contract); otherwise a
  // fresh open. "Practice" opens the Movement timer when a movement mode is set, else the
  // Mindless sit (both forward to the same door).
  const isResume = !!partialToday && partialToday.targetSec - partialToday.bankedSec > 0
  const openTimer = () => {
    const resume = isResume && partialToday
      ? { resumeFromSec: partialToday.bankedSec, secondsTarget: partialToday.targetSec }
      : {}
    // autoStart: selecting a practice opens the timer and begins the countdown immediately.
    if (movementMode) movement.open({ practiceId, mode: movementMode, autoStart: true, ...resume })
    else mindless.open({ practiceId, autoStart: true, ...resume })
  }
  const [pending, start] = useTransition()
  const [done, setDone] = useState<{ logged: boolean; zaps: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear the lingering confirmation timer on unmount or when the step changes (the player remounts
  // this per practice via `key`), so a stale "Logged" never flashes on the next practice.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  function log() {
    if (pending) return
    setError(null)
    start(async () => {
      const res = await logPracticeAction(practiceId)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setDone({ logged: res.data.logged, zaps: res.data.zapsAwarded })
      onLogged?.(practiceId)
      router.refresh()
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setDone(null), CONFIRM_MS)
    })
  }

  const base =
    'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition-colors disabled:opacity-60'
  const restLogged = logged && !done

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      <div className="flex flex-wrap items-center gap-2">
        {usesTimer ? (
          // Practice — opens the timer overlay pre-set to this practice. No navigation.
          <button
            type="button"
            onClick={openTimer}
            className={`${base} bg-primary text-on-primary hover:bg-primary-hover`}
          >
            <Timer className="h-4 w-4 shrink-0" aria-hidden /> {isResume ? 'Continue Practice' : 'Start Practice'}
          </button>
        ) : (
          // Log it — earns Zaps + a streak tick. Confirms inline, then resets.
          <button
            type="button"
            onClick={log}
            disabled={pending}
            aria-live="polite"
            className={`${base} ${
              restLogged
                ? 'border border-success/40 bg-success-bg text-success'
                : 'bg-primary text-on-primary hover:bg-primary-hover'
            }`}
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> Logging
              </>
            ) : done || restLogged ? (
              <>
                <Check className="h-4 w-4 shrink-0" aria-hidden /> Logged
              </>
            ) : (
              <>
                <Check className="h-4 w-4 shrink-0" aria-hidden /> Log it
              </>
            )}
          </button>
        )}
      </div>

      {/* Timer practices: set the expectation that running the sit is what counts it (#5). */}
      {usesTimer && !done && (
        <p className="flex items-center gap-1.5 text-xs text-subtle">
          <Timer className="h-3.5 w-3.5 shrink-0" aria-hidden /> Run the full timer to count this practice.
        </p>
      )}

      {/* Confirmation: a warm, specific line. Zaps when the log just paid out; a calm note when it
          was already logged today (idempotent, never an error). Pillar named when natural. */}
      {done && (
        <p className="text-xs font-medium text-success">
          {done.logged
            ? done.zaps > 0
              ? `Logged. +${done.zaps} Zaps${pillar ? ` for ${pillar}` : ''}.`
              : 'Logged. Nice work.'
            : 'Already logged today. Keep the streak going.'}
        </p>
      )}

      {error && <p className="text-xs font-medium text-danger">{error}</p>}
    </div>
  )
}
