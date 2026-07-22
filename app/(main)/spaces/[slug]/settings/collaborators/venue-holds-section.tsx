import { listAcceptedCollaborations } from '@/lib/spaces/collaborations'
import { listVenueHoldsForSpace } from '@/lib/spaces/venue-holds'
import { SectionHeader } from '@/components/ui/section-header'
import { VenueHoldsPanel } from './venue-holds-panel'

// VENUE COORDINATION SECTION (B3, server). Reads this space's accepted collaborators (the venues it may
// request) + its venue holds (both directions), and renders the client panel. Renders nothing until there
// is an accepted collaborator to coordinate with, so it only appears once it earns its place.
export async function VenueHoldsSection({ spaceId }: { spaceId: string }) {
  const [collabs, holds] = await Promise.all([
    listAcceptedCollaborations(spaceId),
    listVenueHoldsForSpace(spaceId),
  ])
  const collaborators = collabs.map((c) => ({ id: c.partner.id, slug: c.partner.slug, name: c.partner.name }))
  if (collaborators.length === 0 && holds.length === 0) return null

  return (
    <section className="mt-8">
      <SectionHeader title="Shared venue" />
      <p className="mb-3 text-sm text-muted">
        Coordinate use of a collaborator&rsquo;s venue. A request is an advisory hold the venue owner
        approves, never a customer booking, so it cannot double-book.
      </p>
      <VenueHoldsPanel spaceId={spaceId} collaborators={collaborators} holds={holds} />
    </section>
  )
}
