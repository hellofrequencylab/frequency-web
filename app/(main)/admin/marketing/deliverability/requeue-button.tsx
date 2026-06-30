'use client'

import { useState, useTransition } from 'react'
import { RefreshCw, Check, AlertCircle } from 'lucide-react'
import { requeueDeadLetters, type RequeueResult } from './actions'

// Revive dead-lettered jobs (all, or one kind). The action re-gates server-side; this
// just confirms, calls it, and reports how many were put back on the queue.
export function RequeueButton({ kind, label }: { kind?: string; label: string }) {
  const [result, setResult] = useState<RequeueResult | null>(null)
  const [pending, start] = useTransition()

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          const scope = kind ? `all "${kind}" jobs` : 'every dead-lettered job'
          if (!confirm(`Requeue ${scope}? They will retry on the next drain.`)) return
          start(async () => setResult(await requeueDeadLetters(kind)))
        }}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary hover:bg-primary-hover text-on-primary text-xs font-semibold px-3 py-1.5 shadow-sm transition-colors disabled:opacity-60"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${pending ? 'animate-spin' : ''}`} />
        {pending ? 'Requeuing…' : label}
      </button>
      {result?.ok && (
        <span className="inline-flex items-center gap-1 text-xs text-success font-medium">
          <Check className="h-3.5 w-3.5" /> Requeued {result.revived}
        </span>
      )}
      {result && !result.ok && (
        <span className="inline-flex items-center gap-1 text-xs text-danger">
          <AlertCircle className="h-3.5 w-3.5" /> {result.error}
        </span>
      )}
    </span>
  )
}
