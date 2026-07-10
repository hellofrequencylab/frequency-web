'use client'

import { useState, useTransition } from 'react'
import { ShieldAlert } from 'lucide-react'
import { openDisputeAction, cancelDisputeAction } from '@/app/(main)/orders/dispute-actions'
import { isError } from '@/lib/action-result'
import type { DisputeStatus } from '@/lib/commerce/disputes'

const REASONS = ['Item not received', 'Not as described', 'Damaged or faulty', 'Billing problem', 'Other'] as const

const STATUS_COPY: Record<DisputeStatus, string> = {
  open: 'Dispute open. Our team is on it.',
  reviewing: 'Dispute under review.',
  resolved_refund: 'Resolved: refund approved.',
  resolved_denied: 'Resolved: no refund.',
  cancelled: 'Dispute withdrawn.',
}

// Member-facing dispute control on an order (Phase 8). If a dispute already exists it shows its
// status (with a withdraw option while it is still live); otherwise it opens a reason picker that
// files the dispute. No money moves here; an operator resolves it.
export function DisputeButton({
  orderId,
  existing,
}: {
  orderId: string
  existing: { id: string; status: DisputeStatus } | null
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<(typeof REASONS)[number]>(REASONS[0])
  const [detail, setDetail] = useState('')
  const [state, setState] = useState<{ id: string; status: DisputeStatus } | null>(existing)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // Already has a dispute: show status, and a withdraw affordance while it is live.
  if (state) {
    const live = state.status === 'open' || state.status === 'reviewing'
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-subtle">
        <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
        <span>{STATUS_COPY[state.status]}</span>
        {live && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null)
                const res = await cancelDisputeAction(state.id)
                if (isError(res)) setError(res.error)
                else setState({ ...state, status: 'cancelled' })
              })
            }
            className="font-semibold text-subtle underline-offset-2 hover:text-text hover:underline disabled:opacity-60"
          >
            Withdraw
          </button>
        )}
        {error && <p className="w-full text-warning">{error}</p>}
      </div>
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs text-subtle transition-colors hover:text-text"
      >
        <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
        Open a dispute
      </button>
    )
  }

  return (
    <div className="w-full space-y-2 rounded-xl border border-border bg-surface-elevated/40 p-3">
      <p className="text-xs font-semibold text-text">What went wrong?</p>
      <div className="flex flex-wrap gap-1.5">
        {REASONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setReason(r)}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              reason === r
                ? 'border-primary bg-primary-bg text-primary-strong'
                : 'border-border text-muted hover:bg-surface-elevated hover:text-text'
            }`}
          >
            {r}
          </button>
        ))}
      </div>
      <textarea
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        placeholder="Add any detail that helps us sort it out (optional)"
        rows={2}
        maxLength={2000}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-subtle outline-none focus:border-primary"
      />
      {error && <p className="text-xs text-warning">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-subtle hover:text-text">
          Cancel
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null)
              const res = await openDisputeAction(orderId, { reason, detail })
              if (isError(res)) setError(res.error)
              else setState({ id: 'pending', status: 'open' })
            })
          }
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {pending ? 'Filing' : 'Submit dispute'}
        </button>
      </div>
    </div>
  )
}
