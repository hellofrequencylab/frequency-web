'use client'

import { useState, useTransition } from 'react'
import { Toggle } from '@/components/admin/toggle'
import { setSmsEnabled } from './actions'

// The operator on/off switch for the platform SMS channel (platform_flags.sms_enabled).
// A Settings toggle: autosaves optimistically and shows an inline "Saved" (ADR-233 §5),
// reverts on error. Lives inside a FormSection tile, so it carries no card of its own.
// `provisioned` is the env legal lock — when it is off, this switch cannot make SMS send,
// so we surface that honestly beneath the control.
export function SmsToggle({ enabled, provisioned }: { enabled: boolean; provisioned: boolean }) {
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
        await setSmsEnabled(next)
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
          {on ? 'SMS is ON' : 'SMS is OFF'}
        </span>
        <Toggle
          checked={on}
          onChange={toggle}
          ariaLabel="Platform SMS enabled"
          disabled={isPending}
          saveState={isPending ? 'saving' : saved ? 'saved' : 'idle'}
        />
      </div>

      {!isPending && !saved && on && !provisioned && (
        <p className="mt-2 text-xs text-warning">
          Switch is on, but SMS stays dormant until the A2P 10DLC registration is set in this
          environment. Nothing sends until both are live.
        </p>
      )}

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  )
}
