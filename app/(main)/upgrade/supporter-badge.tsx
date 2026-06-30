'use client'

import { useState, useTransition } from 'react'
import { Heart, Loader2 } from 'lucide-react'
import { toggleSupporterBadge } from './actions'
import { isError } from '@/lib/action-result'

// PWYW SUPPORTER BADGE opt-in (Pricing ladder Phase C, ADR-463). Supporter is no longer a tier; it is an
// opt-in badge a Crew member wears to back the work beyond membership. This toggles profiles.is_supporter
// (the charge is dormant until billing goes live). The suggested + minimum amounts are operator-set
// (catalog PWYW config) and shown as the framing, not a live charge while OFF. Plain voice, no em dashes.

export function SupporterBadge({
  initialOn,
  minLabel,
  suggestedLabel,
}: {
  initialOn: boolean
  minLabel: string
  suggestedLabel: string
}) {
  const [on, setOn] = useState(initialOn)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function toggle() {
    const next = !on
    setOn(next)
    setError(null)
    start(async () => {
      const res = await toggleSupporterBadge(next)
      if (isError(res)) {
        setOn(!next)
        setError(res.error)
      }
    })
  }

  return (
    <div className="mt-5 rounded-2xl border border-signal/30 bg-signal-bg/20 p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-signal-bg/60">
          <Heart className="h-4 w-4 text-signal-strong" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-text">Wear the Supporter badge</p>
            {on && (
              <span className="rounded-md bg-signal-bg/60 px-2 py-0.5 text-3xs font-bold uppercase tracking-wider text-signal-strong">
                On
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            Back the work beyond membership and wear the Supporter badge on your profile. You pick the amount, starting
            at {minLabel} a month. Most Supporters give {suggestedLabel}. You can turn this off anytime.
          </p>
          <button
            onClick={toggle}
            disabled={pending}
            className={
              on
                ? 'mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-muted transition-colors hover:bg-surface-elevated disabled:opacity-60'
                : 'mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-signal/40 bg-signal-bg/40 px-4 py-2.5 text-sm font-bold text-signal-strong transition-colors hover:bg-signal-bg/60 disabled:opacity-60'
            }
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Heart className="h-4 w-4" aria-hidden />}
            {on ? 'Remove the Supporter badge' : 'Become a Supporter'}
          </button>
          {error && (
            <p className="mt-2 text-xs text-danger" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
