import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { FocusTemplate } from '@/components/templates'
import { getMyProfileId } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { listSpaceAvailability } from '@/lib/spaces/booking'
import { BookingAvailabilityForm } from '@/components/spaces/booking-availability-form'
import { BookingOwnerList } from '@/components/spaces/booking-owner-list'
import { SectionHeader } from '@/components/ui/section-header'

// OWNER AVAILABILITY EDITOR + BOOKINGS (ENTITY-SPACES-SYSTEM section 2.4, booking v1). A centered,
// no-rail Focus surface (registered 'none' for /spaces/<slug>/settings/availability in
// page-chrome.ts). It resolves the Space, gates on canEditProfile (404s otherwise so a non-editor
// cannot tell the surface exists), then renders:
//   1. the weekly availability editor (setSpaceAvailability behind the form), seeded with the
//      current windows + the Space's configured timezone, and
//   2. the owner's UPCOMING bookings (member name + time), streamed behind <Suspense>.
//
// COPY runs CONTENT-VOICE: plain labels, no narrated feelings, no em/en dashes.

export const metadata = {
  title: 'Availability',
}

export default async function SpaceAvailabilityPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const viewerProfileId = await getMyProfileId()

  // Resolve the Space, failing closed on a missing / not-visible Space (no existence leak).
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  // Gate: only an editor+ (owner / admin / editor) may set availability. 404 (not 403) so the
  // surface never confirms it exists to someone who cannot edit.
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!caps.canEditProfile) notFound()

  const windows = await listSpaceAvailability(space.id)
  // Seed the timezone from the saved windows, else a sensible default the owner can change.
  const initialTimezone = windows[0]?.timezone ?? 'UTC'
  const brandName = space.brandName ?? space.name

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Availability"
      description="Set the weekly windows members can book. Times are in the timezone you choose, and members see them in that zone."
      back={{ href: `/spaces/${space.slug}/settings`, label: 'Space settings' }}
      width="wide"
    >
      <div className="space-y-8">
        <BookingAvailabilityForm
          spaceId={space.id}
          slug={space.slug}
          initialWindows={windows}
          initialTimezone={initialTimezone}
        />

        <section>
          <SectionHeader title="Upcoming bookings" />
          <Suspense fallback={<BookingsSkeleton />}>
            <BookingOwnerList spaceId={space.id} />
          </Suspense>
        </section>
      </div>
    </FocusTemplate>
  )
}

// Dimension-matched skeleton for the streamed bookings list (no CLS, PAGE-FRAMEWORK section 5.4).
function BookingsSkeleton() {
  return (
    <div className="space-y-px rounded-2xl border border-border bg-surface p-2 shadow-sm">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-elevated/50" />
      ))}
    </div>
  )
}
