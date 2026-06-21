'use client'

import { useTransition } from 'react'
import { Undo2 } from 'lucide-react'
import { unlogPracticeAction } from '@/app/(main)/practices/actions'
import { isError } from '@/lib/action-result'

// The quiet "Undo" affordance next to a "Logged today" practice (WEBSITE-CHANGES-PLAN
// §3 B.1 / D4 = today-only). It reverses today's log: the durable row, the idempotency
// row, the exact Zap grant, and the streak all roll back server-side, so a member who
// logged by mistake can take it back the same day. Past days are not reversible here by
// design.
//
// Authz is fully server-side (the action resolves the member from the session and only
// touches their own log). This control is just the trigger. `onUnlogged` lets the parent
// row flip back to its un-logged state so the "Log practice" button returns.
export function UnlogPracticeButton({
  practiceId,
  onUnlogged,
}: {
  practiceId: string
  /** Fired after a successful un-log, so a parent can restore the log control. */
  onUnlogged?: () => void
}) {
  const [pending, start] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      aria-label="Undo today's log"
      onClick={() =>
        start(async () => {
          // Same fallback tz as logging, so the un-log targets the SAME local day.
          const tz = (() => {
            try {
              return Intl.DateTimeFormat().resolvedOptions().timeZone || null
            } catch {
              return null
            }
          })()
          const res = await unlogPracticeAction(practiceId, tz)
          if (!isError(res) && res.data.unlogged) onUnlogged?.()
        })
      }
      className="inline-flex items-center gap-1 text-xs font-medium text-subtle underline-offset-2 transition-colors hover:text-text hover:underline disabled:opacity-60 motion-reduce:transition-none"
    >
      <Undo2 className="h-3 w-3" aria-hidden />
      {pending ? 'Undoing…' : 'Undo'}
    </button>
  )
}
