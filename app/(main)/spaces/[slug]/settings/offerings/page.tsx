import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { FocusTemplate } from '@/components/templates'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { spaceManageHref } from '@/lib/spaces/types'
import { resolveSpaceManageAccess } from '@/lib/spaces/entitlements'
import { offeringSectionsForType } from '@/lib/spaces/offerings'
import type { Space } from '@/lib/spaces/types'
import { AvailabilitySection } from '../availability/section'
import { MembershipsSection } from '../memberships/section'
import { DonationsSection } from '../donations/section'
import { EnrollSection } from '../enroll/section'
import { TicketsSection } from '../tickets/section'
import { CheckinSection } from '../checkin/section'
import { HandHeart } from 'lucide-react'

// THE UNIFIED OFFERINGS SURFACE (the deeper Offerings merge). One adaptive, no-rail Focus surface that
// stacks whichever commerce sub-surfaces apply to THIS space's type, instead of the five separate
// type-gated settings sub-pages it replaces:
//   practitioner -> Availability
//   business     -> Memberships
//   organization -> Donations + Enrollment
//   event_space  -> Tickets + Check in
//   (lab / partner / coaching / root have no commerce section -> a tasteful empty state)
//
// The old individual routes (/settings/availability, /memberships, /donations, /enroll, /tickets,
// /checkin) still resolve: each redirects here anchored to its section (#<anchor>), so bookmarks and
// links never 404. This page owns the ROUTE + AUTH gate ONCE (resolveSpaceManageAccess, notFound), then
// composes each section BODY (the extracted `*Section` components), which each re-check their OWN
// per-Space function gate and render the SAME forms whose server actions stay the source of truth.
//
// SPEED (PAGE-FRAMEWORK §5): every section does slow awaits (loads its data + streams its list), so each
// renders behind its own <Suspense> and its fetches run in parallel; the shell paints immediately.
//
// SECURITY: a Server Component, gated server-side. It resolves the Space, gates RENDER on canManage ||
// staffViewing, and notFound()s otherwise (no existence leak). Every mutation re-checks its OWN gate in
// its form's server action, so this render gate is UX and the actions stay the authority.

export const metadata = {
  title: 'Offerings',
}

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

export default async function SpaceOfferingsPage({
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

  // Gate RENDER on canManage (owner / admin / editor) OR staffViewing (a janitor previewing). 404 (not
  // 403) for everyone else so a non-manager cannot tell the surface exists. Every write stays gated in
  // its form's server action, so staff viewing is read-only end to end.
  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) notFound()

  const brandName = space.brandName ?? space.name
  const sections = offeringSectionsForType(space.type)

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Offerings"
      description="Everything people can book, join, support, or attend. Open a section to set it up; it shows on your space page."
      back={{ href: spaceManageHref(space.type, space.slug), label: `Manage ${brandName}` }}
      width="wide"
    >
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
    </FocusTemplate>
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
