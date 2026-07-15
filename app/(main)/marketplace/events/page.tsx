import { EventsSurface } from '@/components/marketplace/events-surface'
import { getEventsIndexData } from '@/app/(main)/events/index-data'

// EVENTS — the Marketplace's events surface (Classifieds · Housing · Market · Events ·
// Frequency Store, ADR-596). It renders the SHARED events surface
// (components/marketplace/events-surface.tsx) on the SAME data + card the /events home runs on
// (getEventsIndexData + EventCard), reframed in the marketplace chrome. This is the commerce TAB,
// so it passes NO member actions (Add Event / Manage / My drafts belong to the member's own /events
// home). Both paid and free events list here. No business logic is duplicated. No em or en dashes.
//
// CANONICAL: this tab serves the same event list as the /events home. To avoid a duplicate-content
// split, its canonical points at /events (the owner's primary, profile-linked events URL) so all
// ranking + AIO signals consolidate there while the commerce tab stays reachable in the marketplace.
export const metadata = {
  title: 'Events',
  description: 'Find paid and free events near you, from community circles and hosts.',
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

  return <EventsSurface data={data} basePath="/marketplace/events" activeCategory={sp.category} />
}
