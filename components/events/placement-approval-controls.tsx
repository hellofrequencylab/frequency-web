'use client'

import { useState, useTransition } from 'react'
import { approveEventPlacement, declineEventPlacement } from '@/app/(main)/events/placement-actions'
import { isError } from '@/lib/action-result'

// Approve / decline buttons for one pending event-placement request. The steward's decision runs a
// server action that sets (or leaves) the event's placement and notifies the requester.

export function PlacementApprovalControls({ requestId }: { requestId: string }) {
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<'approved' | 'declined' | null>(null)
  const [pending, startTransition] = useTransition()

  function act(kind: 'approve' | 'decline') {
    setError(null)
    startTransition(async () => {
      const res = kind === 'approve' ? await approveEventPlacement(requestId) : await declineEventPlacement(requestId)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setDone(kind === 'approve' ? 'approved' : 'declined')
    })
  }

  if (done) {
    return <span className="text-xs font-medium text-subtle">{done === 'approved' ? 'Approved' : 'Declined'}</span>
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-danger">{error}</span>}
      <button
        type="button"
        onClick={() => act('decline')}
        disabled={pending}
        className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-text disabled:opacity-40"
      >
        Decline
      </button>
      <button
        type="button"
        onClick={() => act('approve')}
        disabled={pending}
        className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-40"
      >
        {pending ? 'Saving…' : 'Approve'}
      </button>
    </div>
  )
}
