'use client'

import { useState, useTransition } from 'react'
import { Check, Zap } from 'lucide-react'
import { logPracticeAction } from '@/app/(main)/practices/actions'
import { isError } from '@/lib/action-result'
import { showZapToast } from '@/components/zap-toast'

// Log a practice → practice.verified (the North-Star event) + zaps + streak.
// Idempotent per practice per day; shows a "Logged today" state after success.
//
// Seed `initialLogged` from the server (getPracticeMemberState().loggedToday /
// getPracticesToLogToday) so a practice already logged today paints in the logged
// state on first render, never showing the button. `onLogged` lets a parent row
// collapse itself after a successful log (the "your practices" tight row uses it).
export function LogPracticeButton({
  practiceId,
  circleId,
  label = 'Log practice',
  initialLogged = false,
  onLogged,
}: {
  practiceId: string
  circleId?: string
  label?: string
  /** Seed the logged-today state from the server (no button on first paint). */
  initialLogged?: boolean
  /** Fired after a successful log, so a parent can collapse the row. */
  onLogged?: () => void
}) {
  const [done, setDone] = useState(initialLogged)
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
