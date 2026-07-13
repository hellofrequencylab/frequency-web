import { Suspense } from 'react'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { listSpaceAvailability, listSpaceServiceTypes } from '@/lib/spaces/booking'
import { BookingAvailabilityForm } from '@/components/spaces/booking-availability-form'
import { BookingAvailabilitySummary } from '@/components/spaces/booking-availability-summary'
import { BookingServiceTypesForm } from '@/components/spaces/booking-service-types-form'
import { BookingOwnerList } from '@/components/spaces/booking-owner-list'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'
import { SectionHeader } from '@/components/ui/section-header'
import type { Space } from '@/lib/spaces/types'

// AVAILABILITY section BODY (extracted from availability/page.tsx so the unified Offerings surface can
// compose it as one stacked section). The route + auth gate (resolveSpaceManageAccess, notFound) stays
// on the CALLER (the individual redirect page is gone; the Offerings page owns the gate once). The
// WRITE action (setSpaceAvailability, behind BookingAvailabilityForm) is unchanged and stays the source
// of truth, re-checking canEditProfile server-side. This component only re-checks the per-Space
// function gate (availability) and loads the same data the page always loaded.
//
// STAFF PREVIEW: a disabled fieldset renders the editor read-only; the reads (listSpaceAvailability)
// stay gated on canEditProfile inside the lib, so a staff previewer sees the structure but reads empty.
// Copy runs CONTENT-VOICE: plain labels, no narrated feelings, no em/en dashes.

export async function AvailabilitySection({
  space,
  viewerProfileId,
  staffViewing,
}: {
  space: Space
  viewerProfileId: string | null
  staffViewing: boolean
}) {
  const brandName = space.brandName ?? space.name

  // PER-SPACE FUNCTION GATE (per-space-roles Phase 2). The default (availability = editor) reproduces
  // the old canEditProfile threshold; a staff janitor keeps the read-only preview (write stays gated).
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!staffViewing && !spaceFunctionAccess(space, 'availability', caps.role)) {
    return (
      <FeatureLockedNotice
        brandName={brandName}
        slug={space.slug}
        type={space.type}
        label="Availability and bookings"
        reason={spaceFunctionAccess(space, 'availability', 'admin') ? 'role' : 'disabled'}
        canManageMembers={caps.canManageMembers}
      />
    )
  }

  const [windows, services] = await Promise.all([
    listSpaceAvailability(space.id),
    listSpaceServiceTypes(space.id),
  ])
  // Seed the timezone from the saved windows, else a sensible default the owner can change.
  const initialTimezone = windows[0]?.timezone ?? 'UTC'

  return (
    <div className="space-y-8">
      {/* A read-only read of what the saved windows offer members (weekly slots, days, lengths),
          derived purely from the windows already loaded above. Renders null when none are saved. */}
      <BookingAvailabilitySummary windows={windows} />

      {/* SERVICES (P1, ADR-605): the reusable "event types" a member picks before a time. A staff
          preview stays read-only via the same disabled fieldset the availability form uses. */}
      <section>
        <SectionHeader title="Services" />
        <p className="-mt-2 mb-4 text-sm text-muted">
          Name what members can book and how long each one runs. Members pick a service, then a time.
        </p>
        <fieldset disabled={staffViewing} className="contents">
          <BookingServiceTypesForm spaceId={space.id} initialServices={services} />
        </fieldset>
      </section>

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
