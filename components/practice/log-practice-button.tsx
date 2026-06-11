'use client'

import { useState, useTransition } from 'react'
import { Check, Zap } from 'lucide-react'
import { logPracticeAction } from '@/app/(main)/practices/actions'
import { isError } from '@/lib/action-result'
import { showZapToast } from '@/components/zap-toast'

// Log a practice → practice.verified (the North-Star event) + zaps + streak.
// Idempotent per practice per day; shows a "Logged today" state after success.
export function LogPracticeButton({
  practiceId,
  circleId,
  label = 'Log practice',
}: {
  practiceId: string
  circleId?: string
  label?: string
}) {
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()

  if (done) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-success-bg text-success px-3 py-1.5 text-sm font-semibold">
        <Check className="w-4 h-4" /> Logged today
      </span>
    )
  }

  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await logPracticeAction(practiceId, circleId)
          if (!isError(res)) {
            setDone(true)
            if (res.data.logged && res.data.zapsAwarded) {
              // Welcome Back: the warm re-entry line — good to see you + one small
              // next step. NEVER broken-streak shame UI on this path.
              const label = res.data.welcomeBack
                ? 'Good to see you. One practice at a time.'
                : 'Practice logged'
              showZapToast({ amount: res.data.zapsAwarded, label })
            }
          }
        })
      }
      className="inline-flex items-center gap-1.5 rounded-lg bg-primary hover:bg-primary-hover text-on-primary px-3 py-1.5 text-sm font-semibold disabled:opacity-60 transition-colors"
    >
      <Zap className="w-4 h-4" strokeWidth={2.5} />
      {pending ? 'Logging…' : label}
    </button>
  )
}
