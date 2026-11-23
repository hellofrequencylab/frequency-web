import { CalendarDays } from 'lucide-react'
import {
  listOpenSlots,
  listBookableServices,
  listPublicOpenSlots,
  readPublicBookingSetup,
  getSpaceBookingTimezone,
  bookingDepositsLive,
} from '@/lib/spaces/booking'
import { getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { viewerManagesSpace } from '@/lib/spaces/operator'
import { EmptyState } from '@/components/ui/empty-state'
import { AdminSetupPrompt } from '@/components/spaces/admin-setup-prompt'
import { BookingPicker } from '@/components/spaces/booking-picker'
import { BookingServiceMember } from '@/components/spaces/booking-service-member'
import { BookingMine } from '@/components/spaces/booking-mine'

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
// SIGNED OUT (BOOK-003): listOpenSlots and listBookableServices answer [] without a profile, so a visitor
// used to read "No open times yet" on a Space with a full week of hours. A signed-out visitor now gets the
// GUEST DOOR the Space website uses (LIVE-835): the same pickers with `guest={{ slug }}`, fed by the public
// reads (readPublicBookingSetup, listPublicOpenSlots), booking with a name and an email through
// createGuestBookingAction (honeypot, per-IP rate limit, a 30 minute hold confirmed from the email,
// SCAN-834). It is offered only when the Space resolves for an anonymous visitor, the exact test the
// door's own actions apply, so a Private Space never shows it (and the actions refuse it anyway).
//
// COPY: plain camp-counselor voice, no narrated feelings, no em/en dashes (CONTENT-VOICE §10).
// TIMEZONE: v1 displays every slot in the Space's configured IANA timezone, LABELED.
//
// SERVICE LINK (BOOK-013): `serviceId` (the Book page's `?service=<id>`) preselects that service on both
// the member and the guest side; BookingServiceMember ignores an id that is not an active service.

// SlotDay + the grouping/label helpers now live in lib/spaces/booking-format (pure, client-safe), so
// re-export the type for any server caller that still imports it from here.
export type { SlotDay } from '@/lib/spaces/booking-format'

export async function BookingMember({
  spaceId,
  slug,
  ownerProfileId,
  serviceId = null,
}: {
  spaceId: string
  slug: string
  ownerProfileId: string | null
  /** BOOK-013: a shared service link's id, preselected when it names an active service. */
  serviceId?: string | null
}) {
  if (!(await getMyProfileId())) return <GuestBooking spaceId={spaceId} slug={slug} serviceId={serviceId} />

  const [slots, services] = await Promise.all([
    listOpenSlots(spaceId),
    listBookableServices(spaceId),
  ])

  // P1: service-first flow when the Space has any active service type. Operators and members share it.
  if (services.length > 0) {
    // P4 (dark): deposits need canTakePayments, payoutsLive AND the payments gate on this Space (LIVE-753), so this resolves
    // false until an owner turns payments on; the picker then keeps the free confirm-only path.
    const [timezone, depositsLive] = await Promise.all([
      getSpaceBookingTimezone(spaceId),
      bookingDepositsLive(spaceId),
    ])
    return (
      <>
        <BookingMine spaceId={spaceId} />
        <BookingServiceMember
          spaceId={spaceId}
          services={services}
          timezone={timezone}
          depositsLive={depositsLive}
          initialServiceId={serviceId}
        />
      </>
    )
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

  return (
    <>
      <BookingMine spaceId={spaceId} />
      <BookingPicker spaceId={spaceId} slots={slots} spaceTimezone={timezone} />
    </>
  )
}

/** The signed-out half (BOOK-003): the guest door on the Space's own Book page. Public reads only, and only
 *  for a Space an anonymous visitor may see; anything else asks the visitor to sign in. */
async function GuestBooking({
  spaceId,
  slug,
  serviceId,
}: {
  spaceId: string
  slug: string
  serviceId: string | null
}) {
  const visible = await getVisibleSpaceBySlug(slug, null)
  if (!visible || visible.id !== spaceId) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Sign in to book."
        description="This space takes bookings from its members."
      />
    )
  }

  const guest = { slug: visible.slug }
  const setup = await readPublicBookingSetup(spaceId)
  if (setup.services.length > 0) {
    return (
      <BookingServiceMember
        spaceId={spaceId}
        services={setup.services}
        timezone={setup.timezone}
        guest={guest}
        initialServiceId={serviceId}
      />
    )
  }

  const slots = setup.windowCount > 0 ? await listPublicOpenSlots(spaceId) : []
  if (slots.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="No open times yet."
        description="This practitioner has not posted availability. Check back soon for new times."
      />
    )
  }
  return <BookingPicker spaceId={spaceId} slots={slots} spaceTimezone={setup.timezone} guest={guest} />
}
