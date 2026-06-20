import { BadgeCheck, Ticket } from 'lucide-react'
import { listTicketTiers, getMyRsvp } from '@/lib/spaces/tickets'
import { EmptyState } from '@/components/ui/empty-state'
import { TicketReserveButton } from '@/components/spaces/tickets/ticket-reserve-button'
import { TicketRsvpCancelButton } from '@/components/spaces/tickets/ticket-rsvp-cancel-button'

// MEMBER TICKETS SURFACE (MASTER-PLAN ADMIN-04, Event Space "Get tickets"). The self-fetching server
// half of the Event Space "Tickets" tab: it loads this Space's active tiers and the viewer's own
// going RSVP (if any), then renders each tier as a card. A 'free' tier shows open entry (nothing to
// reserve); an 'rsvp' tier shows a Reserve button (or, when the viewer already holds that spot, a
// confirmation + a Cancel). When the owner has not published any tiers, an EmptyState names the
// situation and the next step. Server-first; the fetch sits behind a <Suspense> in the caller
// (entity-cta) so the tab paints instantly (PAGE-FRAMEWORK §5).
//
// HONESTY (CONTENT-VOICE skeptic test): v1 takes NO payment. A tier is free entry or a no-charge RSVP;
// reserving records the spot, it does not take a charge. The copy says so plainly, with no narrated
// feelings and no em/en dashes (CONTENT-VOICE §10).

export async function TicketsMember({ spaceId }: { spaceId: string }) {
  const [tiers, mine] = await Promise.all([listTicketTiers(spaceId), getMyRsvp(spaceId)])

  if (tiers.length === 0) {
    return (
      <EmptyState
        icon={Ticket}
        title="No tickets posted yet."
        description="This space has not posted any tickets. Follow it to hear the moment they open."
      />
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Reserve a spot to let the host know you are coming. We do not take a payment.
      </p>
      <div className="grid gap-4 @lg:grid-cols-2">
        {tiers.map((tier) => {
          const reservedHere = mine?.tierId === tier.id
          return (
            <div
              key={tier.id}
              className="flex h-full flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-base font-bold leading-tight text-text">{tier.name}</h3>
                <span className="shrink-0 rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-semibold text-muted">
                  {tier.kind === 'free' ? 'Free entry' : 'RSVP'}
                </span>
              </div>

              {tier.description && (
                <p className="mt-2 text-sm leading-relaxed text-muted">{tier.description}</p>
              )}

              {tier.kind === 'rsvp' && tier.capacity != null && (
                <p className="mt-2 text-2xs text-subtle">{tier.capacity} spots</p>
              )}

              <div className="mt-auto pt-4">
                {tier.kind === 'free' ? (
                  <p className="text-sm text-muted">Open entry. No reservation needed.</p>
                ) : reservedHere && mine ? (
                  <div className="rounded-xl border border-success/30 bg-success-bg px-4 py-3 text-center">
                    <BadgeCheck className="mx-auto mb-1.5 h-6 w-6 text-success" aria-hidden />
                    <p className="text-sm font-semibold text-text">You have a spot.</p>
                    <div className="mt-3 flex justify-center">
                      <TicketRsvpCancelButton rsvpId={mine.id} />
                    </div>
                  </div>
                ) : (
                  // A member may hold a spot on a different tier and still reserve this one (v1 caps at
                  // one going RSVP per member per tier, not per Space), so the button stays enabled.
                  <TicketReserveButton spaceId={spaceId} tierId={tier.id ?? ''} />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
