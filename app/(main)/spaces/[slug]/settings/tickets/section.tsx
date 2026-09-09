import { Suspense } from 'react'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { listAllTicketTiers } from '@/lib/spaces/tickets'
import { TicketTierForm } from '@/components/spaces/tickets/ticket-tier-form'
import { TicketRsvpList } from '@/components/spaces/tickets/ticket-rsvp-list'
import { FeatureLockedNotice } from '@/components/spaces/feature-locked-notice'
import { SectionHeader } from '@/components/ui/section-header'
import type { Space } from '@/lib/spaces/types'

// TICKETS section BODY. Its ONE caller is ./tickets-body.tsx, the `?panel=tickets` workspace. Offerings
// does not compose it: a Space-level copy of the ticket flow answered the same question as the EVENT one,
// so the section came off that page and the `tickets` function key is retired to `events` (LIVE-226,
// lib/spaces/functions.ts RETIRED_SPACE_FUNCTIONS). Selling a seat belongs to an event.
//
// The route + auth gate stays on the caller. The WRITE action (setTicketTiers, behind TicketTierForm) is
// unchanged and stays the source of truth (canEditProfile server-side). The gate below resolves through
// the retired key to the `events` switch + min-role. No em/en dashes.

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
        // Phase 4 (docs/VALUE-LADDER.md A3): this notice mounted with NO featureKey, so a plan-reason
        // gap rendered no upsell at all. Tickets SOLD is an order-level count, not in scope on the tier
        // editor, so the standing ladder stays on the plan-and-usage hub.
        featureKey="space_tickets"
        currentPlan={space.plan}
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
    <div className="space-y-px rounded-card border border-border bg-surface p-2 lift-1">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-elevated/50" />
      ))}
    </div>
  )
}
