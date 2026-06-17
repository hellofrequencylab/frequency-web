'use client'

// Journeys v2 — the per-step PRACTICE actions for the learn player. On a `practice` step (a lesson
// backed by a library practice), a follower gets two clear, practice-specific actions ON TOP of the
// lesson flow's "Mark complete & continue":
//   • Practice — opens the Mindless timer overlay pre-set to this practice (the global useMindless
//     hook, mounted app-wide; no navigation, the follower stays in the lesson).
//   • Log — logs the practice (earns Zaps + ticks the streak) via logPracticeAction, with a
//     pending state, a brief "Logged" confirmation, then router.refresh() so progress reflects it.
// Client-only (event handlers + transition). Token colors only; voice canon, no em dashes.

import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Play, Zap, Loader2 } from 'lucide-react'
import { useMindless } from '@/components/on-air/mindless'
import { logPracticeAction } from '@/app/(main)/practices/actions'
import { isError } from '@/lib/action-result'

/** How long the "Logged" confirmation lingers before the buttons reset to rest. */
const CONFIRM_MS = 4000

export function PracticeActions({
  practiceId,
  /** The step's Pillar name, when known — used only to colour the confirmation copy naturally. */
  pillar,
  /** Compact variant for tight rows (the syllabus); default is the roomy lesson-pane pair. */
  compact = false,
}: {
  practiceId: string
  pillar?: string
  compact?: boolean
}) {
  const router = useRouter()
  const { open } = useMindless()
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
      router.refresh()
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setDone(null), CONFIRM_MS)
    })
  }

  const base =
    'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition-colors disabled:opacity-60'

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      <div className="flex flex-wrap items-center gap-2">
        {/* Practice — opens the Mindless timer overlay pre-set to this practice. No navigation. */}
        <button
          type="button"
          onClick={() => open({ practiceId })}
          className={`${base} bg-primary text-on-primary hover:bg-primary-hover`}
        >
          <Play className="h-4 w-4 shrink-0" aria-hidden /> Practice
        </button>

        {/* Log — earns Zaps + a streak tick. Confirms inline, then resets. */}
        <button
          type="button"
          onClick={log}
          disabled={pending}
          aria-live="polite"
          className={`${base} border border-border bg-surface text-text hover:bg-surface-elevated`}
        >
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> Logging
            </>
          ) : done ? (
            <>
              <Check className="h-4 w-4 shrink-0 text-success" aria-hidden /> Logged
            </>
          ) : (
            <>
              <Zap className="h-4 w-4 shrink-0 text-subtle" aria-hidden /> Log it
            </>
          )}
        </button>
      </div>

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
