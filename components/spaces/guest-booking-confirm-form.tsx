'use client'

import { useActionState } from 'react'
import { CalendarCheck, CalendarX } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button'
import { confirmGuestBookingFormAction } from '@/lib/spaces/booking-actions'
import type { GuestConfirmFormState } from '@/lib/spaces/booking'

// The guest's Confirm button (SCAN-858). Opening the emailed link only shows this; the booking is confirmed
// when the guest presses it, so a mail scanner that follows every link confirms nothing.

export function ConfirmBookingForm({ token, spaceId, bookHref }: { token: string; spaceId: string; bookHref: string }) {
  const [state, action, pending] = useActionState<GuestConfirmFormState, FormData>(confirmGuestBookingFormAction, null)

  if (!state) {
    return (
      <form action={action} className="rounded-card border border-border bg-surface px-6 py-8 text-center">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="spaceId" value={spaceId} />
        <CalendarCheck className="mx-auto mb-3 h-8 w-8 text-muted" aria-hidden />
        <button type="submit" disabled={pending} className={buttonClasses('primary', 'md')}>
          {pending ? 'Confirming…' : 'Confirm my booking'}
        </button>
      </form>
    )
  }

  const { outcome, when } = state
  if (!outcome.ok) {
    const expired = outcome.reason === 'expired'
    return (
      <div className="rounded-card border border-border bg-surface px-6 py-8 text-center">
        <CalendarX className="mx-auto mb-3 h-8 w-8 text-muted" aria-hidden />
        <p className="text-body-sm font-semibold text-text">{expired ? 'That hold has lapsed.' : 'That link did not work.'}</p>
        <p className="mt-1 mb-4 text-body-sm text-muted">
          {expired
            ? 'We held your time for thirty minutes and the clock ran out. The time is open again, so pick it, or another, and we will send a fresh link.'
            : 'The link may be incomplete or already used. Pick a time again and we will send a fresh one.'}
        </p>
        <a href={bookHref} className={buttonClasses('primary', 'md')}>
          Pick a time
        </a>
      </div>
    )
  }

  const already = outcome.state === 'already'
  return (
    <div className="rounded-card border border-success/30 bg-success-bg px-6 py-8 text-center" role="status">
      <CalendarCheck className="mx-auto mb-3 h-8 w-8 text-success" aria-hidden />
      <p className="text-body-sm font-semibold text-text">{already ? 'You are already booked.' : 'You are booked.'}</p>
      <p className="mt-1 text-body-sm text-text">{outcome.serviceName ?? `Session with ${outcome.spaceName}`}</p>
      {when && <p className="mt-1 text-body-sm text-muted">{when}</p>}
      <p className="mt-1 text-body-sm text-muted">
        {already
          ? 'This time was confirmed earlier. Your confirmation email has the details.'
          : 'Your confirmation email, with a calendar file, is on its way.'}
      </p>
      <a href={bookHref} className={`mt-4 inline-block ${buttonClasses('secondary', 'sm')}`}>
        Book another time
      </a>
    </div>
  )
}
