'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { setAiEnabled } from './actions'

export function AiToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function toggle() {
    start(async () => {
      await setAiEnabled(!enabled)
      router.refresh()
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
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
          enabled ? 'bg-primary' : 'border border-border-strong bg-surface-elevated'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted">
        {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {pending ? 'Saving…' : enabled ? 'On' : 'Off'}
      </span>
    </div>
  )
}
