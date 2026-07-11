'use client'

// The approve / reject console for one Non Profit verification (ADR-552, AUDIT #6). Approving grants the
// discounted Non Profit plan; rejecting requires a short reason the owner sees. The page passes the
// pending row; this client dispatches the gated actions and refreshes. Strings are CONTENT-VOICE (plain,
// no em dashes); semantic tokens only, no hardcoded hex.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, X } from 'lucide-react'
import { Textarea, fieldClasses } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import { approveNonprofitVerification, rejectNonprofitVerification } from './actions'

export function ReviewConsole({ id }: { id: string }) {
  const router = useRouter()
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function approve() {
    setError(null)
    start(async () => {
      const res = await approveNonprofitVerification(id)
      if (isError(res)) setError(res.error)
      else router.refresh()
    })
  }

  function reject() {
    setError(null)
    start(async () => {
      const res = await rejectNonprofitVerification(id, note)
      if (isError(res)) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {!rejecting ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={approve}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
            Approve and grant Non Profit
          </button>
          <button
            type="button"
            onClick={() => setRejecting(true)}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated disabled:opacity-60"
          >
            <X className="h-3.5 w-3.5" aria-hidden /> Reject
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why is this being rejected? The owner sees this note."
            className={fieldClasses}
            rows={2}
            maxLength={500}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={reject}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-xs font-bold text-on-primary transition-colors hover:opacity-90 disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />}
              Confirm reject
            </button>
            <button
              type="button"
              onClick={() => setRejecting(false)}
              disabled={pending}
              className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-surface-elevated disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="text-2xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
