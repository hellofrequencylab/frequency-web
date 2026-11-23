'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Loader2, X } from 'lucide-react'
import { isError } from '@/lib/action-result'
import { cancelBooking, listOpenSlotsForService } from '@/lib/spaces/booking-actions'
import type { MyBooking, OpenSlot } from '@/lib/spaces/booking'
import { BookingPicker } from '@/components/spaces/booking-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'

// MEMBER SELF-SERVE BOOKINGS (client, P3, ADR-605). The member's own upcoming bookings with a Space,
// each with Cancel (optional reason) and Reschedule. Reschedule loads the same service's open times and
// reuses BookingPicker in reschedule mode (atomic new-then-cancel, re-validated + guarded server-side).
// Cancel is gated by the policy window server-side; the button only hides when canModify is false.
//
// COPY: plain camp-counselor voice, no narrated feelings, no em/en dashes (CONTENT-VOICE §10).

export function BookingMineList({
  spaceId,
  bookings,
  timezone,
}: {
  spaceId: string
  bookings: MyBooking[]
  timezone: string
}) {
  const whenFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <ul className="divide-y divide-border rounded-card border border-border bg-surface lift-1">
      {bookings.map((b) => (
        <li key={b.id} className="px-4 py-3">
          <BookingMineRow spaceId={spaceId} booking={b} whenLabel={whenFmt.format(new Date(b.startsAt))} timezone={timezone} />
        </li>
      ))}
    </ul>
  )
}

function BookingMineRow({
  spaceId,
  booking,
  whenLabel,
  timezone,
}: {
  spaceId: string
  booking: MyBooking
  whenLabel: string
  timezone: string
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'idle' | 'cancel' | 'reschedule'>('idle')
  const [reason, setReason] = useState('')
  const [slots, setSlots] = useState<OpenSlot[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [loading, startLoad] = useTransition()

  function openReschedule() {
    setMode('reschedule')
    setError(null)
    setSlots(null)
    startLoad(async () => {
      const open = await listOpenSlotsForService(spaceId, booking.serviceTypeId)
      setSlots(open)
    })
  }

  function doCancel() {
    setError(null)
    start(async () => {
      const result = await cancelBooking(booking.id, reason.trim() || undefined)
      if (isError(result)) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-body-sm font-semibold text-text">{booking.serviceName ?? 'Session'}</p>
          <p className="flex items-center gap-1.5 text-meta text-muted">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {whenLabel}
          </p>
        </div>
        {booking.canModify && mode === 'idle' && (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              onClick={openReschedule}
              variant="secondary"
              size="sm"
            >
              Reschedule
            </Button>
            <Button
              type="button"
              onClick={() => {
                setMode('cancel')
                setError(null)
              }}
              variant="ghost"
              size="sm"
            >
              <X className="h-3.5 w-3.5" aria-hidden /> Cancel
            </Button>
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-card bg-danger-bg px-3 py-2 text-meta font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      {mode === 'cancel' && (
        <div className="space-y-2 rounded-card border border-border bg-surface-elevated/40 p-3">
          <label htmlFor={`reason-${booking.id}`} className="text-meta font-medium text-muted">
            Reason (optional)
          </label>
          <Input
            id={`reason-${booking.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            className="py-1.5"
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={doCancel}
              loading={pending}
              variant="dangerOutline"
              size="sm"
            >
              Cancel booking
            </Button>
            <Button
              type="button"
              onClick={() => setMode('idle')}
              disabled={pending}
              variant="ghost"
              size="sm"
            >
              Keep
            </Button>
          </div>
        </div>
      )}

      {mode === 'reschedule' && (
        <div className="space-y-3 rounded-card border border-border bg-surface-elevated/40 p-3">
          <div className="flex items-center justify-between">
            <p className="text-meta font-semibold text-muted">Pick a new time</p>
            <Button
              type="button"
              onClick={() => setMode('idle')}
              variant="ghost"
              size="sm"
            >
              Close
            </Button>
          </div>
          {loading || slots === null ? (
            <div className="flex items-center gap-2 text-body-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading times
            </div>
          ) : slots.length === 0 ? (
            <p className="text-body-sm text-muted">No open times right now. Try again later.</p>
          ) : (
            <BookingPicker
              spaceId={spaceId}
              slots={slots}
              spaceTimezone={timezone}
              serviceTypeId={booking.serviceTypeId}
              rescheduleBookingId={booking.id}
            />
          )}
        </div>
      )}
    </div>
  )
}
