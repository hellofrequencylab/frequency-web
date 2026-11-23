'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Clock, Loader2, MapPin } from 'lucide-react'
import { listGuestOpenSlotsAction, listOpenSlotsForService } from '@/lib/spaces/booking-actions'
import type { OpenSlot, ServiceType } from '@/lib/spaces/booking'
import { durationLabel, whereLabel } from '@/lib/spaces/booking-format'
import { BookingPicker } from '@/components/spaces/booking-picker'
import { EmptyState } from '@/components/ui/empty-state'
import { CalendarDays } from 'lucide-react'

// MEMBER SERVICE-FIRST BOOKING (client, P1, ADR-605). When a Space publishes service types, the member
// picks a service FIRST, then a time. Selecting a service loads that service's open slots (sliced by
// its duration, from the windows that offer it) through the listOpenSlotsForService action, groups them
// by day in the Space timezone, and hands them to the same BookingPicker the flat path uses. The chosen
// service is threaded into createBooking so the server re-validates against its duration.
//
// GUEST MODE (LIVE-835): with `guest` (the Space slug) the same two steps run on the Space's website for a
// visitor with no account. Times load through the anonymous listGuestOpenSlotsAction and the picker books
// through the guest door; no deposit path.
//
// SERVICE LINK (BOOK-013): `initialServiceId` (from `?service=<id>` on the Book page) opens straight on that
// service's times, the way a Calendly event link does. It only matches a service in `services`, which
// holds active bookable services only, so an unknown or retired id falls back to the list silently.
//
// COPY: plain camp-counselor voice, no narrated feelings, no em/en dashes (CONTENT-VOICE §10). Tokens
// only, no hex.

export function BookingServiceMember({
  spaceId,
  services,
  timezone,
  depositsLive = false,
  guest = null,
  initialServiceId = null,
}: {
  spaceId: string
  services: ServiceType[]
  /** The Space's configured IANA timezone (labeled; the picker shows times in the viewer's own tz). */
  timezone: string
  /** P4 (dark): when deposits are live, a service with a linked product opens deposit checkout. */
  depositsLive?: boolean
  /** LIVE-835: list and book as a guest on the Space's website. Null keeps the member flow. */
  guest?: { slug: string } | null
  /** BOOK-013: preselect this service (a shared service link). Ignored when it is not in `services`. */
  initialServiceId?: string | null
}) {
  // Undefined until the visitor picks or goes back, so a link's service (which can arrive after
  // hydration on the website) still applies; null is the list.
  const [chosenId, setChosenId] = useState<string | null | undefined>(undefined)
  const selectedId = chosenId === undefined ? initialServiceId : chosenId
  const selected = services.find((s) => s.id === selectedId) ?? null
  const [loaded, setLoaded] = useState<{ id: string; slots: OpenSlot[] } | null>(null)
  const slots = selected && loaded?.id === selected.id ? loaded.slots : null
  const guestSlug = guest?.slug ?? null
  const selectedKey = selected?.id ?? null

  useEffect(() => {
    if (!selectedKey) return
    let live = true
    const load = guestSlug
      ? listGuestOpenSlotsAction(guestSlug, selectedKey)
      : listOpenSlotsForService(spaceId, selectedKey)
    load
      .then((open) => {
        if (live) setLoaded({ id: selectedKey, slots: open })
      })
      .catch(() => {
        if (live) setLoaded({ id: selectedKey, slots: [] })
      })
    return () => {
      live = false
    }
  }, [selectedKey, guestSlug, spaceId])

  function pick(service: ServiceType) {
    setChosenId(service.id)
  }

  function back() {
    setChosenId(null)
    setLoaded(null)
  }

  // Step 2: a service is chosen. Show its times (or a calm empty state), plus a way back.
  if (selected) {
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={back}
          className="inline-flex items-center gap-1.5 text-body-sm font-semibold text-primary-strong transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> All services
        </button>

        <div className="rounded-card border border-border bg-surface-elevated/40 px-4 py-3">
          <p className="text-body-sm font-bold text-text">{selected.name}</p>
          <p className="flex items-center gap-1.5 text-meta text-muted">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {durationLabel(selected.durationMinutes)}
            {selected.description ? ` · ${selected.description}` : ''}
          </p>
          {selected.location ? (
            <p className="mt-1 flex items-center gap-1.5 text-meta text-muted">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {whereLabel(selected.location)}
            </p>
          ) : null}
        </div>

        {slots === null ? (
          <div className="flex items-center gap-2 px-1 text-body-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading times
          </div>
        ) : slots.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No open times for this service yet."
            description={
              guest
                ? 'Pick a different service, or check back soon for new times.'
                : 'Follow this space to hear the moment new times open, or pick a different service.'
            }
          />
        ) : (
          <BookingPicker
            spaceId={spaceId}
            slots={slots}
            spaceTimezone={timezone}
            serviceTypeId={selected.id}
            questions={selected.questions}
            depositProductId={!guest && depositsLive && selected.productId ? selected.productId : null}
            guest={guest}
          />
        )}
      </div>
    )
  }

  // Step 1: pick a service.
  return (
    <div className="space-y-4">
      <p className="text-body-sm text-muted">Pick a service to see open times.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {services.map((service) => (
          <button
            key={service.id}
            type="button"
            onClick={() => pick(service)}
            className="flex flex-col items-start gap-1 rounded-card border border-border bg-surface p-4 text-left lift-1 transition-colors hover:border-border-strong hover:bg-surface-elevated"
          >
            <span className="text-body-sm font-bold text-text">{service.name}</span>
            <span className="flex items-center gap-1.5 text-meta font-semibold text-muted">
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {durationLabel(service.durationMinutes)}
            </span>
            {service.description && (
              <span className="line-clamp-2 text-meta text-subtle">{service.description}</span>
            )}
            {service.location && (
              <span className="flex items-center gap-1.5 text-meta text-subtle">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {whereLabel(service.location)}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
