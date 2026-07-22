'use client'

import { useState, useTransition } from 'react'
import { approveEventShare, declineEventShare } from '@/app/(main)/events/share-actions'
import { isError } from '@/lib/action-result'

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
    return <span className="text-xs font-medium text-subtle">{done === 'accepted' ? 'Added' : 'Declined'}</span>
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
        {pending ? 'Saving…' : 'Add to calendar'}
      </button>
    </div>
  )
}
