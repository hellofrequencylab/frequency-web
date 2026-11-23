'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isError } from '@/lib/action-result'
import { cancelBooking } from '@/lib/spaces/booking-actions'

// CANCEL A BOOKING (client). Calls the cancelBooking server action (the booker or a space admin may
// cancel; the server is the gate). On success it refreshes so the released slot reopens. A confirm
// step guards an accidental tap. No em/en dashes (CONTENT-VOICE section 10).

export function BookingCancelButton({ bookingId }: { bookingId: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function cancel() {
    setError(null)
    start(async () => {
      const result = await cancelBooking(bookingId)
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
        <Button
          type="button"
          onClick={cancel}
          loading={pending}
          variant="dangerOutline"
          size="sm"
        >
          Confirm
        </Button>
        <Button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          variant="ghost"
          size="sm"
        >
          Keep
        </Button>
      </span>
    )
  }

  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <Button
        type="button"
        onClick={() => setConfirming(true)}
        variant="ghost"
        size="sm"
      >
        <X className="h-3.5 w-3.5" aria-hidden /> Cancel
      </Button>
      {error && <span className="text-2xs font-medium text-danger">{error}</span>}
    </span>
  )
}
