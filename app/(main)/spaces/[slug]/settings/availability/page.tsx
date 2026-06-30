import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { listSpaceAvailability } from '@/lib/spaces/booking'
import { BookingAvailabilityForm } from '@/components/spaces/booking-availability-form'
import { BookingAvailabilitySummary } from '@/components/spaces/booking-availability-summary'
import { BookingOwnerList } from '@/components/spaces/booking-owner-list'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'
import { SectionHeader } from '@/components/ui/section-header'

// OWNER AVAILABILITY EDITOR + BOOKINGS (ENTITY-SPACES-SYSTEM section 2.4, booking v1). A centered,
// no-rail Focus surface (registered 'none' for /spaces/<slug>/settings/availability in
// page-chrome.ts). It resolves the Space, gates RENDER on canManage || staffViewing (404s otherwise
// so a non-editor / non-staff viewer cannot tell the surface exists), then renders:
//   1. the weekly availability editor (setSpaceAvailability behind the form), seeded with the
//      current windows + the Space's configured timezone, and
//   2. the owner's UPCOMING bookings (member name + time), streamed behind <Suspense>.
//
// STAFF PREVIEW (a janitor viewing a Space they don't manage): a Staff preview banner shows and the
// editor is wrapped in a disabled fieldset (read-only). The write action (setSpaceAvailability) stays
// gated on canEditProfile server-side, so staff viewing never confers a write. NOTE: the streamed
// lists (listSpaceAvailability / listSpaceBookings) are themselves gated on canEditProfile, so a
// staff viewer sees the editor structure but the seeded windows + bookings read empty (read-only +
// no leak of who booked). COPY runs CONTENT-VOICE: plain labels, no narrated feelings, no em/en dashes.

export const metadata = {
  title: 'Availability',
}

export default async function SpaceAvailabilityPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  // Resolve the Space, failing closed on a missing / not-visible Space (no existence leak).
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) notFound()

  // Gate RENDER on canManage (owner / admin / editor) OR staffViewing (a janitor previewing). 404
  // (not 403) for everyone else. The WRITE action (setSpaceAvailability) stays gated on
  // canEditProfile, so staff viewing is read-only end to end.
  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) notFound()

  const brandName = space.brandName ?? space.name

  // PER-SPACE FUNCTION GATE (per-space-roles Phase 2). The single resolver folds the tool's ON/OFF
  // switch and its lowest-role for this space. The Phase-1 default (availability = editor) reproduces
  // the old canEditProfile threshold, so behavior is unchanged unless an operator/owner tunes it. A
  // staff janitor (caps.role === null) is exempt: they keep the read-only preview the surface always
  // gave them, with every write still gated server-side.
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!staffViewing && !spaceFunctionAccess(space, 'availability', caps.role)) {
    return (
      <FocusTemplate
        eyebrow={brandName}
        title="Availability"
        description="The weekly booking windows for this space."
        back={{ href: `/spaces/${space.slug}/settings`, label: `Manage ${brandName}` }}
      >
        <FeatureLockedNotice
          brandName={brandName}
          slug={space.slug}
          label="Availability and bookings"
          reason={spaceFunctionAccess(space, 'availability', 'admin') ? 'role' : 'disabled'}
          canManageMembers={caps.canManageMembers}
        />
      </FocusTemplate>
    )
  }

  const windows = await listSpaceAvailability(space.id)
  // Seed the timezone from the saved windows, else a sensible default the owner can change.
  const initialTimezone = windows[0]?.timezone ?? 'UTC'

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Availability"
      description="Set the weekly windows members can book. Times are in the timezone you choose, and members see them in that zone."
      back={{ href: `/spaces/${space.slug}/settings`, label: `Manage ${brandName}` }}
      width="wide"
    >
      {staffViewing && <StaffPreviewBanner spaceName={brandName} />}

      <div className="space-y-8">
        {/* A read-only read of what the saved windows offer members (weekly slots, days, lengths),
            derived purely from the windows already loaded above. Renders null when none are saved. */}
        <BookingAvailabilitySummary windows={windows} />

        {/* A disabled fieldset renders the editor READ-ONLY for a staff preview (it natively disables
            every nested control in the form). `display: contents` keeps it out of the layout box. */}
        <fieldset disabled={staffViewing} className="contents">
          <BookingAvailabilityForm
            spaceId={space.id}
            slug={space.slug}
            initialWindows={windows}
            initialTimezone={initialTimezone}
          />
        </fieldset>

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
