'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { setHostPayoutsEnabled } from './actions'

// The master on/off switch for host payouts (tips, event tickets, future store/
// membership sales). A Settings toggle: autosaves optimistically and shows an inline
// "Saved" (ADR-233 §5 save semantics); reverts on error. Lives inside a FormSection tile,
// so it carries no card of its own.
export function PayoutsToggle({
  enabled,
  stripeConfigured,
}: {
  enabled: boolean
  stripeConfigured: boolean
}) {
  const [on, setOn] = useState(enabled)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function toggle() {
    const next = !on
    setOn(next)
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        await setHostPayoutsEnabled(next)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } catch (e) {
        setOn(!next)
        setError(e instanceof Error ? e.message : 'Could not save.')
      }
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <span className={`text-sm font-semibold ${on ? 'text-success' : 'text-subtle'}`}>
          {on ? 'Payouts are ON' : 'Payouts are OFF'}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Host payouts enabled"
          onClick={toggle}
          disabled={isPending}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 motion-reduce:transition-none ${
            on ? 'bg-primary' : 'bg-border-strong'
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-surface shadow transition-transform motion-reduce:transition-none ${
              on ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      <div className="mt-2 flex min-h-5 items-center gap-2 text-xs">
        {isPending && (
          <span className="inline-flex items-center gap-1.5 text-subtle">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
          </span>
        )}
        {!isPending && saved && (
          <span className="inline-flex items-center gap-1.5 font-medium text-success">
            <Check className="h-3.5 w-3.5" /> Saved
          </span>
        )}
        {!isPending && !saved && on && !stripeConfigured && (
          <span className="text-warning">Stripe key not configured, still dormant until keys are set.</span>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  )
}
