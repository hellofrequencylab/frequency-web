'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, X } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { cancelRsvp } from '@/lib/spaces/tickets-actions'

// CANCEL AN RSVP (client). Calls the cancelRsvp server action (the member who reserved or a space
// admin may cancel; the server is the gate). On success it refreshes so the surface flips back to the
// Reserve button. A confirm step guards an accidental tap. No em/en dashes (CONTENT-VOICE §10).

export function TicketRsvpCancelButton({ rsvpId }: { rsvpId: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function cancel() {
    setError(null)
    start(async () => {
      const result = await cancelRsvp(rsvpId)
      if (isError(result)) {
        setError(result.error)
        setConfirming(false)
        return
      }
      router.refresh()
    })
  }

  if (confirming) {
    return (
      <span className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={cancel}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-lg border border-danger px-2.5 py-1 text-xs font-semibold text-danger transition-colors hover:bg-danger-bg disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          Confirm
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="text-xs font-semibold text-muted transition-colors hover:text-text"
        >
          Keep
        </button>
      </span>
    )
  }

  return (
    <span className="flex shrink-0 flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:border-danger/40 hover:text-danger"
      >
        <X className="h-3.5 w-3.5" aria-hidden /> Cancel RSVP
      </button>
      {error && <span className="text-2xs font-medium text-danger">{error}</span>}
    </span>
  )
}
