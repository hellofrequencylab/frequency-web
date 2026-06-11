'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import { setAiEnabled } from './actions'

// `onToggled` lets an embedded host (e.g. the in-place AI module in the console)
// re-fetch its own state after a change; the standalone page omits it and falls
// back to a router refresh. A Settings toggle: autosaves with an inline "Saved"
// (ADR-233 §5).
export function AiToggle({ enabled, onToggled }: { enabled: boolean; onToggled?: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)

  function toggle() {
    setSaved(false)
    start(async () => {
      await setAiEnabled(!enabled)
      if (onToggled) onToggled()
      else router.refresh()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="AI enabled"
        disabled={pending}
        onClick={toggle}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 motion-reduce:transition-none ${
          enabled ? 'bg-primary' : 'border border-border-strong bg-surface-elevated'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted">
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {!pending && saved && <Check className="h-3.5 w-3.5 text-success" />}
        {pending ? 'Saving…' : saved ? 'Saved' : enabled ? 'On' : 'Off'}
      </span>
    </div>
  )
}
