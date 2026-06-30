'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarCheck, Check, Clock, Loader2 } from 'lucide-react'
import { Button, buttonClasses } from '@/components/ui/button'
import { Textarea } from '@/components/ui/field'
import { isError } from '@/lib/action-result'
import { createBooking } from '@/lib/spaces/booking-actions'
import type { OpenSlot } from '@/lib/spaces/booking'
import type { SlotDay } from '@/components/spaces/booking-member'
import { cn } from '@/lib/utils'

// MEMBER BOOKING PICKER (client). The interactive half of the Practitioner Book tab: open slots are
// grouped by day (in the Space's timezone, labeled), a member taps a time, optionally adds a note,
// and confirms via the createBooking server action. The server re-validates the slot, so the picker
// is convenience, not the gate. On success it shows a calm confirmation and refreshes the surface so
// the booked time drops out of the open list. No narrated feelings, no em/en dashes (CONTENT-VOICE).

export function BookingPicker({
  spaceId,
  days,
  timezone,
  tzLabel,
  sessionLabel,
}: {
  spaceId: string
  days: SlotDay[]
  /** The Space's configured IANA timezone (every slot is shown in it). */
  timezone: string
  /** A short label for that timezone, e.g. "EDT". */
  tzLabel: string
  /** A plain-language session-length line, e.g. "30 minute sessions", or null when unknown. */
  sessionLabel: string | null
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<OpenSlot | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [booked, setBooked] = useState<string | null>(null)
  const [pending, startBooking] = useTransition()

  const timeFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  })

  function confirm() {
    if (!selected) return
    setError(null)
    const target = selected
    startBooking(async () => {
      const result = await createBooking(spaceId, target.startsAt, note.trim() || undefined)
      if (isError(result)) {
        setError(result.error)
        return
      }
      setBooked(target.startsAt)
      setSelected(null)
      setNote('')
      router.refresh()
    })
  }

  if (booked) {
    const when = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(booked))
    return (
      <div className="rounded-2xl border border-success/30 bg-success-bg px-6 py-8 text-center">
        <CalendarCheck className="mx-auto mb-3 h-8 w-8 text-success" aria-hidden />
        <p className="text-sm font-semibold text-text">You are booked.</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
          {when} ({tzLabel}). You can manage this from your bookings.
        </p>
        <button
          type="button"
          onClick={() => setBooked(null)}
          className="mt-4 text-xs font-semibold text-primary-strong hover:text-primary"
        >
          Book another time
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <p className="flex items-center gap-1.5 text-sm text-muted">
        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {sessionLabel ? `${sessionLabel}. ` : ''}Times shown in {tzLabel}. Pick a slot to book a 1:1
        session.
      </p>

      <div className="space-y-5">
        {days.map((day) => (
          <div key={day.key}>
            <h3 className="mb-2 text-sm font-bold tracking-tight text-text">{day.label}</h3>
            <div className="flex flex-wrap gap-2">
              {day.slots.map((slot) => {
                const active = selected?.startsAt === slot.startsAt
                return (
                  <button
                    key={slot.startsAt}
                    type="button"
                    onClick={() => {
                      setSelected(active ? null : slot)
                      setError(null)
                    }}
                    aria-pressed={active}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-sm font-semibold tabular-nums transition-colors',
                      active
                        ? 'border-primary bg-primary-bg text-primary-strong'
                        : 'border-border text-text hover:border-border-strong hover:bg-surface-elevated',
                    )}
                  >
                    {timeFmt.format(new Date(slot.startsAt))}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <p className="text-sm font-semibold text-text">
            Confirm {timeFmt.format(new Date(selected.startsAt))} on{' '}
            {new Intl.DateTimeFormat('en-US', {
              timeZone: timezone,
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            }).format(new Date(selected.startsAt))}{' '}
            ({tzLabel})
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {selected.slotMinutes} minute session
          </p>
          <div>
            <label htmlFor="booking-note" className="text-xs font-medium text-muted">
              Add a note (optional)
            </label>
            <Textarea
              id="booking-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything the practitioner should know before your session."
              rows={3}
              maxLength={500}
              className="mt-1"
            />
          </div>
          {error && (
            <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger" role="alert">
              {error}
            </p>
          )}
          <div className="flex items-center gap-3">
            <Button type="button" onClick={confirm} disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Booking
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" aria-hidden /> Confirm booking
                </>
              )}
            </Button>
            <button
              type="button"
              onClick={() => {
                setSelected(null)
                setNote('')
                setError(null)
              }}
              disabled={pending}
              className={buttonClasses('ghost', 'md')}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && !selected && (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
