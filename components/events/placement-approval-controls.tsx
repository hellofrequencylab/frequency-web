'use client'

import { useState, useTransition } from 'react'
import { approveEventPlacement, declineEventPlacement } from '@/app/(main)/events/placement-actions'
import { isError } from '@/lib/action-result'
import { Button } from '@/components/ui/button'

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
    return <span className="text-meta font-medium text-subtle">{done === 'approved' ? 'Approved' : 'Declined'}</span>
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-meta text-danger">{error}</span>}
      <button
        type="button"
        onClick={() => act('decline')}
        disabled={pending}
        className="rounded-control px-2.5 py-1.5 text-meta font-medium text-muted transition-colors hover:text-text disabled:opacity-40"
      >
        Decline
      </button>
      <Button
        size="sm"
        type="button"
        onClick={() => act('approve')}
        disabled={pending}
      >
        {pending ? 'Saving…' : 'Approve'}
      </Button>
    </div>
  )
}
