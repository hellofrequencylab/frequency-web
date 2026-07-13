import { CalendarDays } from 'lucide-react'
import {
  listOpenSlots,
  listBookableServices,
  getSpaceBookingTimezone,
} from '@/lib/spaces/booking'
import { viewerManagesSpace } from '@/lib/spaces/operator'
import { EmptyState } from '@/components/ui/empty-state'
import { AdminSetupPrompt } from '@/components/spaces/admin-setup-prompt'
import { BookingPicker } from '@/components/spaces/booking-picker'
import { BookingServiceMember } from '@/components/spaces/booking-service-member'

// MEMBER BOOKING SURFACE (ENTITY-SPACES-SYSTEM §2.4 booking v1; ADR-605 booking ladder P1). The
// self-fetching server half of the Practitioner's Book tab.
//
// P1: when the Space publishes SERVICE TYPES, the member picks a service first (BookingServiceMember,
// client), then a time sliced by that service's duration. With NO services, it falls back to the
// legacy flat picker over the next ~14 days of open slots grouped by day in the Space's timezone.
// When the practitioner has not published availability, an operator (owner / admin / editor) sees a
// setup prompt; a member sees the calm "no open times" empty state. When windows exist but NO service
// is defined yet, the operator sees an "add your first service" nudge (the P0.5 prompt, P1 variant).
//
// COPY: plain camp-counselor voice, no narrated feelings, no em/en dashes (CONTENT-VOICE §10).
// TIMEZONE: v1 displays every slot in the Space's configured IANA timezone, LABELED.

// SlotDay + the grouping/label helpers now live in lib/spaces/booking-format (pure, client-safe), so
// re-export the type for any server caller that still imports it from here.
export type { SlotDay } from '@/lib/spaces/booking-format'

export async function BookingMember({
  spaceId,
  slug,
  ownerProfileId,
}: {
  spaceId: string
  slug: string
  ownerProfileId: string | null
}) {
  const [slots, services] = await Promise.all([
    listOpenSlots(spaceId),
    listBookableServices(spaceId),
  ])

  // P1: service-first flow when the Space has any active service type. Operators and members share it.
  if (services.length > 0) {
    const timezone = await getSpaceBookingTimezone(spaceId)
    return <BookingServiceMember spaceId={spaceId} services={services} timezone={timezone} />
  }

  // No services. The legacy flat path, plus operator guidance on the empty / unconfigured states.
  if (slots.length === 0) {
    if (await viewerManagesSpace({ id: spaceId, ownerProfileId })) {
      return (
        <AdminSetupPrompt
          icon={CalendarDays}
          title="Your button opens booking, but your calendar is empty."
          description="Set your weekly times so members can book you. You can also change what your button opens."
          links={[
            { href: `/spaces/${slug}/settings/offerings#availability`, label: 'Set up availability' },
            {
              href: `/spaces/${slug}/manage/mode`,
              label: 'Change what your button opens',
              tone: 'secondary',
            },
          ]}
        />
      )
    }
    return (
      <EmptyState
        icon={CalendarDays}
        title="No open times yet."
        description="This practitioner has not posted availability. Follow this space to hear the moment new times open."
      />
    )
  }

  // Windows exist (slots generate) but no service is defined yet. Nudge the operator to add one; a
  // member still books the legacy flat slots.
  if (await viewerManagesSpace({ id: spaceId, ownerProfileId })) {
    return (
      <AdminSetupPrompt
        icon={CalendarDays}
        title="Your times are live. Add your first service."
        description="A service (like a 30 minute session) tells members what they are booking and how long it runs."
        links={[
          {
            href: `/spaces/${slug}/settings/offerings#availability`,
            label: 'Add your first service',
          },
        ]}
      />
    )
  }

  // Resolve the Space timezone for labeling; the picker shows every slot in the viewer's own tz (P2).
  const timezone = await getSpaceBookingTimezone(spaceId)

  return <BookingPicker spaceId={spaceId} slots={slots} spaceTimezone={timezone} />
}
