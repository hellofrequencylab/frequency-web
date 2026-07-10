'use client'

import { useState, useTransition } from 'react'
import { bookServiceAction } from '@/app/(main)/market/service-actions'
import { buttonClasses } from '@/components/ui/button'

// The member-facing slot picker for a bookable service (Phase 4, ADR-596). Server-fetched open slots
// (from the Space's availability calendar) rendered as buttons; a click calls bookServiceAction, which
// HOLDs the slot and redirects to Stripe (paid), confirms it (free), or signals enquiry (contact-only).
// No em or en dashes.

interface Slot {
  startsAt: string
  slotMinutes: number
}

export function ServiceBookingPicker({
  productId,
  slots,
  timezone,
  contactOnly,
}: {
  productId: string
  slots: Slot[]
  timezone: string
  contactOnly?: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [enquiry, setEnquiry] = useState(false)

  if (contactOnly) {
    return <p className="text-sm text-muted">This service is by enquiry. Reach out to the space to arrange a time.</p>
  }
  if (slots.length === 0) {
    return <p className="text-sm text-subtle">No open times right now. Check back soon.</p>
  }

  const book = (startsAt: string) => {
    setError(null)
    startTransition(async () => {
      const res = await bookServiceAction(productId, startsAt)
      if (res.enquiry) {
        setEnquiry(true)
        return
      }
      if (res.error) {
        setError(res.error)
        return
      }
      if (res.url) window.location.href = res.url
    })
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-US', {
      timeZone: timezone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })

  return (
    <div className="space-y-3">
      {enquiry && (
        <p className="rounded-lg bg-warning-bg/20 px-3 py-2 text-sm text-text">
          This service is by enquiry. Reach out to the space to arrange it.
        </p>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {slots.slice(0, 24).map((s) => (
          <button
            key={s.startsAt}
            type="button"
            disabled={pending}
            onClick={() => book(s.startsAt)}
            className={`${buttonClasses('secondary', 'sm')} justify-between`}
          >
            <span>{fmt(s.startsAt)}</span>
            <span className="text-xs text-subtle">{s.slotMinutes}m</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-subtle">Times shown in {timezone}. Booking holds your slot; payment runs on Stripe.</p>
      {error && <p className="rounded-lg bg-warning-bg/20 px-3 py-2 text-sm text-text">{error}</p>}
    </div>
  )
}
