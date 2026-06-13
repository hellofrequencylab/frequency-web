'use client'

import { useState, useTransition } from 'react'
import { Check, Zap } from 'lucide-react'
import { logPracticeAction } from '@/app/(main)/practices/actions'
import { isError } from '@/lib/action-result'
import { showZapToast } from '@/components/zap-toast'
import { fireJourneyComplete } from '@/components/journey/journey-celebration'

// The Journey Next-Step Log tap-target (docs/JOURNEYS.md §6, §10 — "the dopamine moment").
// Logging a journey practice rides the SAME practice_logs the gamification runs on, so one
// tap advances the journey AND earns the rewards. On success we:
//   • flip to a "Logged today" state with an animated +Zaps badge,
//   • surface the base zaps + any journey bonuses (Full Day / Weekly Rhythm) as toasts,
//   • fire the full-screen celebration when a "Journey complete" bonus is present.
//
// The `journey` field on the result (bonuses/zaps/gems) is the §6 reward-firing payload; it
// may be absent until the firing is wired (P1) — everything degrades gracefully without it.

// Shape of the optional journey reward payload returned by logPracticeAction (docs §6/§10).
interface JourneyReward {
  bonuses?: { label: string; kind: 'zaps' | 'gems'; amount: number }[]
  zaps?: number
  gems?: number
}

const COMPLETE = /journey complete|complete/i

export function JourneyLogButton({
  practiceId,
  circleId,
  planTitle,
  label = 'Log today',
  full = false,
  onLogged,
}: {
  practiceId: string
  circleId?: string | null
  /** The journey title, shown in the completion celebration. */
  planTitle: string
  label?: string
  /** Render as a big, full-width tap target (the Next-Step card's primary action). */
  full?: boolean
  /** Fired after a successful log — lets a host (e.g. the course player) advance to
   *  the next lesson once this practice is complete. */
  onLogged?: () => void
}) {
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()

  const base = full
    ? 'inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-base font-bold transition-colors'
    : 'inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition-colors'

  if (done) {
    return (
      <span
        className={`${base} bg-success-bg text-success animate-[slideUp_0.3s_ease-out]`}
        aria-live="polite"
      >
        <Check className={full ? 'h-5 w-5' : 'h-4 w-4'} strokeWidth={2.5} /> Logged today
      </span>
    )
  }

  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        start(async () => {
          const res = await logPracticeAction(practiceId, circleId)
          if (isError(res)) return
          setDone(true)
          onLogged?.()
          const { logged, zapsAwarded } = res.data
          const journey = (res.data as { journey?: JourneyReward }).journey

          // Base practice zaps (only on a fresh log).
          if (logged && zapsAwarded > 0) {
            showZapToast({ amount: zapsAwarded, label: 'Practice logged' })
          }

          // Journey bonuses — Full Day / Weekly Rhythm surface as their own toasts; a
          // "Journey complete" bonus also triggers the full-screen celebration.
          let completionGems: number | undefined
          for (const b of journey?.bonuses ?? []) {
            if (b.kind === 'zaps' && b.amount > 0) showZapToast({ amount: b.amount, label: b.label })
            if (COMPLETE.test(b.label)) completionGems = b.kind === 'gems' ? b.amount : (journey?.gems ?? undefined)
          }
          if (completionGems !== undefined || (journey?.gems ?? 0) > 0) {
            // Only celebrate on an actual completion bonus, not every gem grant.
            const hasComplete = (journey?.bonuses ?? []).some((b) => COMPLETE.test(b.label))
            if (hasComplete) fireJourneyComplete({ title: planTitle, gems: completionGems ?? journey?.gems })
          }
        })
      }
      className={`${base} bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-60`}
    >
      <Zap className={full ? 'h-5 w-5' : 'h-4 w-4'} strokeWidth={2.5} />
      {pending ? 'Logging…' : label}
    </button>
  )
}
