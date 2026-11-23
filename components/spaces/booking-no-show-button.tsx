'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, UserX } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { markBookingNoShow } from '@/lib/spaces/booking-actions'

// MARK A NO-SHOW (client, BOOK-012). Calls the markBookingNoShow server action (space admins only; the
// server is the gate). The mark lands on the member's Space timeline, so a confirm step guards a slip.

export function BookingNoShowButton({ bookingId }: { bookingId: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function mark() {
    setError(null)
    start(async () => {
      const result = await markBookingNoShow(bookingId)
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
          onClick={mark}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-control border border-border px-2.5 py-1 text-meta font-semibold text-text transition-colors hover:bg-surface-elevated disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          Yes, they missed it
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="text-meta font-semibold text-muted transition-colors hover:text-text"
        >
          Back
        </button>
      </span>
    )
  }

  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-1 rounded-control border border-border px-2.5 py-1 text-meta font-semibold text-muted transition-colors hover:text-text"
      >
        <UserX className="h-3.5 w-3.5" aria-hidden /> No-show
      </button>
      {error && <span className="text-2xs font-medium text-danger">{error}</span>}
    </span>
  )
}
