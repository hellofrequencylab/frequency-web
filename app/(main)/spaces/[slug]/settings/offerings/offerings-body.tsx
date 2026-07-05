import { Suspense } from 'react'
import { HandHeart } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { offeringSectionsForType } from '@/lib/spaces/offerings'
import type { Space } from '@/lib/spaces/types'
import { AvailabilitySection } from '../availability/section'
import { MembershipsSection } from '../memberships/section'
import { DonationsSection } from '../donations/section'
import { EnrollSection } from '../enroll/section'
import { TicketsSection } from '../tickets/section'
import { CheckinSection } from '../checkin/section'

// OFFERINGS BODY — the chrome-free unified commerce surface, lifted out of the standalone
// /settings/offerings page (Stage D2) so it renders in TWO places from one source: (1) that page, wrapped
// in its FocusTemplate chrome, and (2) INLINE in the Space profile body as the Offerings `?panel=`
// workspace (components/spaces/workspace/space-body-panel.tsx). It owns NO page chrome (the caller frames
// it) and SELF-GATES server-side so it is safe to mount anywhere: it returns null when the viewer may not
// manage this Space (the standalone page still 404s via its own gate, so a null here never renders a bare
// 200).
//
// It stacks whichever commerce sub-surfaces apply to THIS space's type (practitioner -> Availability;
// business -> Memberships; organization -> Donations + Enrollment; event_space -> Tickets + Check in; the
// remaining types get a tasteful empty state). Each section re-checks its OWN per-tool gate and renders the
// SAME forms whose server actions stay the source of truth. SPEED (PAGE-FRAMEWORK §5): every section does
// slow awaits, so each renders behind its own <Suspense> and its fetches run in parallel. COPY: plain
// labels, no em/en dashes.

/** Per-section header copy (CONTENT-VOICE: plain, no em/en dashes). Keyed by the offering anchor. */
const SECTION_META: Record<string, { title: string; blurb: string }> = {
  availability: {
    title: 'Availability and bookings',
    blurb: 'Set the weekly times members can book, and see who is on your calendar.',
  },
  memberships: {
    title: 'Memberships',
    blurb: 'Define the tiers members can join, and see who has joined. Paid billing comes later.',
  },
  donations: {
    title: 'Donations',
    blurb: 'Set up your fund and the amounts supporters can pick. Paid giving comes later.',
  },
  enroll: {
    title: 'Enrollment',
    blurb: 'Define your program and see who has enrolled. Paid enrollment comes later.',
  },
  tickets: {
    title: 'Tickets',
    blurb: 'Set up free or RSVP ticket tiers, and see who has reserved a spot.',
  },
  checkin: {
    title: 'Check in',
    blurb: 'Show the door code and see who has checked in.',
  },
}

/** Bind an offering anchor to its section body. Each takes the resolved space + the preview flag. */
function renderSection(
  anchor: string,
  space: Space,
  viewerProfileId: string | null,
  staffViewing: boolean,
) {
  const common = { space, viewerProfileId, staffViewing }
  switch (anchor) {
    case 'availability':
      return <AvailabilitySection {...common} />
    case 'memberships':
      return <MembershipsSection {...common} />
    case 'donations':
      return <DonationsSection {...common} />
    case 'enroll':
      return <EnrollSection {...common} />
    case 'tickets':
      return <TicketsSection {...common} />
    case 'checkin':
      return <CheckinSection {...common} />
    default:
      return null
  }
}

export async function OfferingsBody({ slug }: { slug: string }) {
  const caller = await getCallerProfile()
  const viewerProfileId = caller?.id ?? null

  // Resolve the Space, failing closed on a missing / not-visible Space (no existence leak).
  const space = await getVisibleSpaceBySlug(slug, viewerProfileId)
  if (!space) return null

  // SELF-GATE on canManage (owner / admin / editor) OR staffViewing (a janitor previewing). Render
  // nothing for everyone else — the standalone page adds its own notFound() so it still 404s.
  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) return null

  const brandName = space.brandName ?? space.name
  const sections = offeringSectionsForType(space.type)

  return (
    <>
      {staffViewing && <StaffPreviewBanner spaceName={brandName} />}

      {sections.length === 0 ? (
        <EmptyState
          icon={HandHeart}
          title="No offerings for this space yet."
          description="This space type does not run bookings, memberships, giving, or tickets. Change your space type to add them."
        />
      ) : (
        <div className="space-y-12">
          {sections.map((section) => {
            const meta = SECTION_META[section.anchor]
            return (
              <section key={section.anchor} id={section.anchor} className="scroll-mt-24">
                <SectionHeader title={meta.title} />
                <p className="-mt-2 mb-4 text-sm text-muted">{meta.blurb}</p>
                <Suspense fallback={<SectionSkeleton />}>
                  {renderSection(section.anchor, space, viewerProfileId, staffViewing)}
                </Suspense>
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}

// Dimension-matched skeleton while a section streams its data (no CLS, PAGE-FRAMEWORK §5.4).
function SectionSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-40 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
      <div className="h-14 animate-pulse rounded-2xl border border-border bg-surface-elevated/50" />
    </div>
  )
}
