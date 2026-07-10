'use client'

// Pending cohost-invite banner. Shown to a signed-in member the host invited to
// cohost this event: Accept to join as a cohost, or Decline. The row is only
// created by the host, so this surface merely answers it. Copy is voice-canon:
// plain, sentence case, no em dashes.

import { useState, useTransition } from 'react'
import { Check, Loader2, UserPlus, X } from 'lucide-react'
import {
  acceptCohostInvite,
  declineCohostInvite,
} from '@/app/(main)/events/[slug]/social-actions'
import { isError } from '@/lib/action-result'

export function CohostInviteBanner({
  eventId,
  slug,
  eventTitle,
}: {
  eventId: string
  slug: string
  eventTitle: string
}) {
  const [pending, start] = useTransition()
  const [state, setState] = useState<'idle' | 'accepted' | 'declined'>('idle')
  const [error, setError] = useState<string | null>(null)

  function accept() {
    if (pending) return
    setError(null)
    start(async () => {
      const res = await acceptCohostInvite(eventId, slug)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setState('accepted')
    })
  }

  function decline() {
    if (pending) return
    setError(null)
    start(async () => {
      const res = await declineCohostInvite(eventId, slug)
      if (isError(res)) {
        setError(res.error)
        return
      }
      setState('declined')
    })
  }

  if (state === 'accepted') {
    return (
      <div className="mb-4 inline-flex items-center gap-2 rounded-2xl border border-success bg-success-bg/40 px-4 py-2.5 text-sm font-semibold text-success">
        <Check className="h-4 w-4" />
        You are a cohost now. You can help run this event.
      </div>
    )
  }

  if (state === 'declined') {
    return (
      <div className="mb-4 rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm text-muted">
        You declined the cohost invite.
      </div>
    )
  }

  return (
    <div className="mb-4 rounded-2xl border border-primary/40 bg-primary-bg/50 px-4 py-3">
      <p className="flex items-center gap-1.5 text-sm font-bold text-text">
        <UserPlus className="h-4 w-4 text-primary" /> You are invited to cohost this event
      </p>
      <p className="mt-1 text-sm text-muted">
        The host invited you to cohost <span className="font-semibold text-text">{eventTitle}</span>.
        Accept to help run it, or decline.
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={accept}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Accept
        </button>
        <button
          type="button"
          onClick={decline}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-muted transition-colors hover:border-border-strong hover:text-text disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
          Decline
        </button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </div>
  )
}
