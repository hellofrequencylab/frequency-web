import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { FocusTemplate } from '@/components/templates'
import { getCallerProfile } from '@/lib/auth'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { resolveSpaceManageAccess, getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { listAllTicketTiers } from '@/lib/spaces/tickets'
import { TicketTierForm } from '@/components/spaces/tickets/ticket-tier-form'
import { TicketRsvpList } from '@/components/spaces/tickets/ticket-rsvp-list'
import { StaffPreviewBanner } from '@/components/spaces/staff-preview-banner'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'
import { SectionHeader } from '@/components/ui/section-header'

// OWNER TICKET TIER EDITOR + RSVPs (MASTER-PLAN ADMIN-03, "Event Space ticketing owner control"). A
// centered, no-rail Focus surface (registered 'none' for /spaces/<slug>/settings/tickets in
// page-chrome.ts, alongside checkin/memberships). It resolves the Space, gates RENDER on canManage ||
// staffViewing (404s otherwise so a non-editor / non-staff viewer cannot tell the surface exists),
// AND gates on the Space being an `event_space` (404s otherwise, since only an Event Space runs
// tickets), then renders:
//   1. the tier editor (setTicketTiers behind the form), seeded with the current tiers, and
//   2. the owner's current RSVPs (member + tier + reserved date), streamed behind <Suspense>.
//
// STAFF PREVIEW (a janitor viewing a Space they don't manage): a Staff preview banner shows and the
// editor is wrapped in a disabled fieldset (read-only). The write action (setTicketTiers) stays gated
// on canEditProfile server-side, so staff viewing never confers a write. NOTE: the seeded tiers + RSVP
// list (listAllTicketTiers / listSpaceRsvps) are themselves gated on canEditProfile, so a staff viewer
// sees the editor structure but they read empty.
//
// NO MONEY (CONTENT-VOICE skeptic test): v1 takes no payment. Tickets are free or RSVP only; the
// editor and the description say plainly that paid ticketing comes later. No em/en dashes.

export const metadata = {
  title: 'Tickets',
}

export default async function SpaceTicketsPage({
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

  // Tickets are an Event Space feature only. A non-event_space Space 404s here, exactly as the hub
  // card is gated to `event_space` (HARD-01 / ADR-339 makes this an exhaustively-checked comparison,
  // no `as string` cast).
  if (space.type !== 'event_space') notFound()

  // Gate RENDER on canManage (owner / admin / editor) OR staffViewing (a janitor previewing). 404
  // (not 403) for everyone else. The WRITE action (setTicketTiers) stays gated on canEditProfile, so
  // staff viewing is read-only end to end.
  const { canManage, staffViewing } = await resolveSpaceManageAccess(
    space,
    viewerProfileId,
    caller?.webRole,
  )
  if (!canManage && !staffViewing) notFound()

  const brandName = space.brandName ?? space.name

  // PER-SPACE FUNCTION GATE (per-space-roles Phase 2). The default (tickets = editor) reproduces the old
  // canEditProfile threshold; a staff janitor keeps the read-only preview (write stays gated).
  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!staffViewing && !spaceFunctionAccess(space, 'tickets', caps.role)) {
    return (
      <FocusTemplate
        eyebrow={brandName}
        title="Tickets"
        description="The ticket tiers for this space's events."
        back={{ href: `/spaces/${space.slug}/settings`, label: `Manage ${brandName}` }}
      >
        <FeatureLockedNotice
          brandName={brandName}
          slug={space.slug}
          label="Tickets"
          reason={spaceFunctionAccess(space, 'tickets', 'admin') ? 'role' : 'disabled'}
          canManageMembers={caps.canManageMembers}
        />
      </FocusTemplate>
    )
  }

  const tiers = await listAllTicketTiers(space.id)

  return (
    <FocusTemplate
      eyebrow={brandName}
      title="Tickets"
      description="Define the ticket tiers for your events. Tickets are free or RSVP only for now, so no payment is taken. Reserving a spot registers an RSVP, and paid ticketing comes later."
      back={{ href: `/spaces/${space.slug}/settings`, label: `Manage ${brandName}` }}
      width="wide"
    >
      {staffViewing && <StaffPreviewBanner spaceName={brandName} />}

      <div className="space-y-8">
        {/* A disabled fieldset renders the editor READ-ONLY for a staff preview (it natively disables
            every nested control in the form). `display: contents` keeps it out of the layout box. */}
        <fieldset disabled={staffViewing} className="contents">
          <TicketTierForm spaceId={space.id} slug={space.slug} initialTiers={tiers} />
        </fieldset>

        <section>
          <SectionHeader title="RSVPs" />
          <Suspense fallback={<RsvpsSkeleton />}>
            <TicketRsvpList spaceId={space.id} />
          </Suspense>
        </section>
      </div>
    </FocusTemplate>
  )
}

// Dimension-matched skeleton for the streamed RSVP list (no CLS, PAGE-FRAMEWORK §5.4).
function RsvpsSkeleton() {
  return (
    <div className="space-y-px rounded-2xl border border-border bg-surface p-2 shadow-sm">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-elevated/50" />
      ))}
    </div>
  )
}
