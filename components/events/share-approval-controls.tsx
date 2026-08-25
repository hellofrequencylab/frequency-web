'use client'

import { useState, useTransition } from 'react'
import { approveEventShare, declineEventShare } from '@/app/(main)/events/share-actions'
import { isError } from '@/lib/action-result'
import { Button } from '@/components/ui/button'

// Approve / decline buttons for one pending event↔space share request (Events EC3). The steward's
// decision runs a server action that flips the share status (atomically) and notifies the requester.
// Mirrors placement-approval-controls.tsx.

export function ShareApprovalControls({ shareId }: { shareId: string }) {
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<'accepted' | 'declined' | null>(null)
  const [pending, startTransition] = useTransition()

  function act(kind: 'approve' | 'decline') {
    setError(null)
    startTransition(async () => {
      const res = kind === 'approve' ? await approveEventShare(shareId) : await declineEventShare(shareId)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setDone(kind === 'approve' ? 'accepted' : 'declined')
    })
  }

  if (done) {
    return <span className="text-meta font-medium text-subtle">{done === 'accepted' ? 'Added' : 'Declined'}</span>
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
        {pending ? 'Saving…' : 'Add to calendar'}
      </Button>
    </div>
  )
}
