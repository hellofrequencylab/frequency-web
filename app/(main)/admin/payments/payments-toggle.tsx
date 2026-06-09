'use client'

import { useState, useTransition } from 'react'
import { Loader2 } from 'lucide-react'
import { setHostPayoutsEnabled } from './actions'

// The master on/off switch for host payouts (tips, event tickets, future store/
// membership sales). Optimistic; reverts on error.
export function PayoutsToggle({
  enabled,
  stripeConfigured,
}: {
  enabled: boolean
  stripeConfigured: boolean
}) {
  const [on, setOn] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function toggle() {
    const next = !on
    setOn(next)
    setError(null)
    startTransition(async () => {
      try {
        await setHostPayoutsEnabled(next)
      } catch (e) {
        setOn(!next)
        setError(e instanceof Error ? e.message : 'Could not save.')
      }
    })
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold text-text">Host payouts</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            When on, hosts can set up payouts and members can pay them — tips, paid event tickets,
            and future store/membership sales. When off, none of those controls appear anywhere.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={toggle}
          disabled={isPending}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
            on ? 'bg-primary' : 'bg-border-strong'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-surface shadow transition-transform ${
              on ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs">
        {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-subtle" />}
        <span className={`font-semibold ${on ? 'text-success' : 'text-subtle'}`}>
          {on ? 'Payouts are ON' : 'Payouts are OFF'}
        </span>
        {on && !stripeConfigured && (
          <span className="text-warning">· Stripe key not configured — still dormant until keys are set</span>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  )
}
