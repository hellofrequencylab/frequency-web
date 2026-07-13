'use client'

import { useState, useTransition } from 'react'
import { ArrowLeft, Clock, Loader2 } from 'lucide-react'
import { listOpenSlotsForService } from '@/lib/spaces/booking-actions'
import type { OpenSlot, ServiceType } from '@/lib/spaces/booking'
import { durationLabel } from '@/lib/spaces/booking-format'
import { BookingPicker } from '@/components/spaces/booking-picker'
import { EmptyState } from '@/components/ui/empty-state'
import { CalendarDays } from 'lucide-react'

// MEMBER SERVICE-FIRST BOOKING (client, P1, ADR-605). When a Space publishes service types, the member
// picks a service FIRST, then a time. Selecting a service loads that service's open slots (sliced by
// its duration, from the windows that offer it) through the listOpenSlotsForService action, groups them
// by day in the Space timezone, and hands them to the same BookingPicker the flat path uses. The chosen
// service is threaded into createBooking so the server re-validates against its duration.
//
// COPY: plain camp-counselor voice, no narrated feelings, no em/en dashes (CONTENT-VOICE §10). Tokens
// only, no hex.

export function BookingServiceMember({
  spaceId,
  services,
  timezone,
  depositsLive = false,
}: {
  spaceId: string
  services: ServiceType[]
  /** The Space's configured IANA timezone (labeled; the picker shows times in the viewer's own tz). */
  timezone: string
  /** P4 (dark): when deposits are live, a service with a linked product opens deposit checkout. */
  depositsLive?: boolean
}) {
  const [selected, setSelected] = useState<ServiceType | null>(null)
  const [slots, setSlots] = useState<OpenSlot[] | null>(null)
  const [loading, startLoad] = useTransition()

  function pick(service: ServiceType) {
    setSelected(service)
    setSlots(null)
    startLoad(async () => {
      const open = await listOpenSlotsForService(spaceId, service.id)
      setSlots(open)
    })
  }

  function back() {
    setSelected(null)
    setSlots(null)
  }

  // Step 2: a service is chosen. Show its times (or a calm empty state), plus a way back.
  if (selected) {
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={back}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-strong transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> All services
        </button>

        <div className="rounded-2xl border border-border bg-surface-elevated/40 px-4 py-3">
          <p className="text-sm font-bold text-text">{selected.name}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {durationLabel(selected.durationMinutes)}
            {selected.description ? ` · ${selected.description}` : ''}
          </p>
        </div>

        {loading || slots === null ? (
          <div className="flex items-center gap-2 px-1 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading times
          </div>
        ) : slots.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No open times for this service yet."
            description="Follow this space to hear the moment new times open, or pick a different service."
          />
        ) : (
          <BookingPicker
            spaceId={spaceId}
            slots={slots}
            spaceTimezone={timezone}
            serviceTypeId={selected.id}
            questions={selected.questions}
            depositProductId={depositsLive && selected.productId ? selected.productId : null}
          />
        )}
      </div>
    )
  }

  // Step 1: pick a service.
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Pick a service to see open times.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {services.map((service) => (
          <button
            key={service.id}
            type="button"
            onClick={() => pick(service)}
            className="flex flex-col items-start gap-1 rounded-2xl border border-border bg-surface p-4 text-left shadow-sm transition-colors hover:border-border-strong hover:bg-surface-elevated"
          >
            <span className="text-sm font-bold text-text">{service.name}</span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {durationLabel(service.durationMinutes)}
            </span>
            {service.description && (
              <span className="line-clamp-2 text-xs text-subtle">{service.description}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
