'use client'

import { useState, useTransition } from 'react'
import { Toggle } from '@/components/admin/toggle'
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
        <Toggle
          checked={on}
          onChange={toggle}
          ariaLabel="Host payouts enabled"
          disabled={isPending}
          saveState={isPending ? 'saving' : saved ? 'saved' : 'idle'}
        />
      </div>

      {!isPending && !saved && on && !stripeConfigured && (
        <p className="mt-2 text-xs text-warning">Stripe key not configured, still dormant until keys are set.</p>
      )}

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  )
}
