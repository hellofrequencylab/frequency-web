import { EventsSurface } from '@/components/marketplace/events-surface'
import { EventsHeaderActions } from '@/components/marketplace/events-header-actions'
import { getEventsIndexData } from '@/app/(main)/events/index-data'

// EVENTS — the Marketplace's events surface (Classifieds · Housing · Market · Events ·
// Frequency Store, ADR-596). It renders the SHARED events surface
// (components/marketplace/events-surface.tsx) on the SAME data + card the /events home runs on
// (getEventsIndexData + EventCard), reframed in the marketplace chrome. It renders the SAME header as
// the /events home: the identical hero copy plus the shared member action cluster (New Event / Manage /
// My drafts), so the two surfaces are visually identical. Both paid and free events list here. No
// business logic is duplicated. No em or en dashes.
//
// CANONICAL: this tab serves the same event list as the /events home. To avoid a duplicate-content
// split, its canonical points at /events (the owner's primary, profile-linked events URL) so all
// ranking + AIO signals consolidate there while the commerce tab stays reachable in the marketplace.
export const metadata = {
  title: 'Events near you',
  description:
    'Find events near you, paid and free, hosted by local circles and community hosts. Browse by category, then RSVP or grab a ticket to what is coming up.',
  alternates: { canonical: '/events' },
}

export default async function MarketplaceEventsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    category?: string
    format?: string
    date?: string
    price?: string
    energy?: string
    spots?: string
    near?: string
    sort?: string
  }>
}) {
  const sp = await searchParams
  const data = await getEventsIndexData(sp)
  const { myProfileId, isCrew, userHasEvents } = data

  // The SAME member action cluster the /events home carries, so both routes render one identical
  // header (unified per ADR-596 follow-up). Gating is unchanged: signed-in members get New Event,
  // and Manage + My drafts appear once they have added an event.
  const actions = (
    <EventsHeaderActions myProfileId={myProfileId} isCrew={isCrew} userHasEvents={userHasEvents} />
  )

  return (
    <EventsSurface
      data={data}
      basePath="/marketplace/events"
      activeCategory={sp.category}
      actions={actions}
    />
  )
}
