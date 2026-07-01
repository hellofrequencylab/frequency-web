import { Suspense } from 'react'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { listAllTicketTiers } from '@/lib/spaces/tickets'
import { TicketTierForm } from '@/components/spaces/tickets/ticket-tier-form'
import { TicketRsvpList } from '@/components/spaces/tickets/ticket-rsvp-list'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'
import { SectionHeader } from '@/components/ui/section-header'
import type { Space } from '@/lib/spaces/types'

// TICKETS section BODY (extracted from tickets/page.tsx so the unified Offerings surface can compose it
// as one stacked section). Tickets are an event_space feature only; the Offerings page composes this
// section ONLY for an event_space (OFFERING_SECTIONS types), so the type check lives on the caller now.
// The route + auth gate stays on the caller. The WRITE action (setTicketTiers, behind TicketTierForm)
// is unchanged and stays the source of truth (canEditProfile server-side). This component re-checks the
// tickets function gate and loads the same tiers the page always loaded.
//
// NO MONEY (CONTENT-VOICE skeptic test): v1 takes no payment. No em/en dashes.

export async function TicketsSection({
  space,
  viewerProfileId,
  staffViewing,
}: {
  space: Space
  viewerProfileId: string | null
  staffViewing: boolean
}) {
  const brandName = space.brandName ?? space.name

  const caps = await getSpaceCapabilities(space, viewerProfileId)
  if (!staffViewing && !spaceFunctionAccess(space, 'tickets', caps.role)) {
    return (
      <FeatureLockedNotice
        brandName={brandName}
        slug={space.slug}
        type={space.type}
        label="Tickets"
        reason={spaceFunctionAccess(space, 'tickets', 'admin') ? 'role' : 'disabled'}
        canManageMembers={caps.canManageMembers}
      />
    )
  }

  const tiers = await listAllTicketTiers(space.id)

  return (
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
