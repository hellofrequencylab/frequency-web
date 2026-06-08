'use client'

import { useState, useTransition } from 'react'
import { Settings, Loader2 } from 'lucide-react'
import { openBillingPortal } from './actions'
import { isError } from '@/lib/action-result'

export function ManageBillingButton() {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function go() {
    setError(null)
    startTransition(async () => {
      const r = await openBillingPortal()
      if (isError(r)) setError(r.error)
      else window.location.href = r.data.url
    })
  }

  return (
    <div className="space-y-2">
      <button
        onClick={go}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-60"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
        Manage subscription
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  )
}
