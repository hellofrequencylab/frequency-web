'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, Loader2 } from 'lucide-react'
import { listGuestOpenSlotsAction } from '@/lib/spaces/booking-actions'
import type { OpenSlot, ServiceType } from '@/lib/spaces/booking'
import { BookingPicker } from '@/components/spaces/booking-picker'
import { BookingServiceMember } from '@/components/spaces/booking-service-member'
import { EmptyState } from '@/components/ui/empty-state'

// THE WEBSITE'S BOOK PAGE BODY (LIVE-835, client). The same service-first picker a member uses on the Space
// page, in guest mode: a visitor books with a name and an email and never leaves the website. The page is
// cached, so the services come from the render and the open times load live, here, through the anonymous
// guest door (the server re-checks the slot on every booking anyway). With no services it is the flat time
// picker over the Space's windows.
//
// COPY: plain camp-counselor voice, no em/en dashes, and no word about Frequency: the website is the owner's.

export function SiteBooking({
  spaceId,
  slug,
  services,
  timezone,
}: {
  spaceId: string
  slug: string
  services: ServiceType[]
  timezone: string
}) {
  if (services.length > 0) {
    return (
      <BookingServiceMember spaceId={spaceId} services={services} timezone={timezone} guest={{ slug }} />
    )
  }
  return <SiteFlatBooking spaceId={spaceId} slug={slug} timezone={timezone} />
}

/** No services: load the Space's open times on mount and hand them to the guest picker. */
function SiteFlatBooking({ spaceId, slug, timezone }: { spaceId: string; slug: string; timezone: string }) {
  const [slots, setSlots] = useState<OpenSlot[] | null>(null)

  useEffect(() => {
    let live = true
    listGuestOpenSlotsAction(slug, null)
      .then((open) => {
        if (live) setSlots(open)
      })
      .catch(() => {
        if (live) setSlots([])
      })
    return () => {
      live = false
    }
  }, [slug])

  if (slots === null) {
    return (
      <div className="flex items-center gap-2 px-1 text-body-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading times
      </div>
    )
  }
  if (slots.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="No open times right now."
        description="Check back soon for new times, or send a message to find one that works."
      />
    )
  }
  return <BookingPicker spaceId={spaceId} slots={slots} spaceTimezone={timezone} guest={{ slug }} />
}
