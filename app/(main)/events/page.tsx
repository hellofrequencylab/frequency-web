import { EventsSurface } from '@/components/marketplace/events-surface'
import { EventsHeaderActions } from '@/components/marketplace/events-header-actions'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, eventsListingSchema } from '@/lib/jsonld'
import { pageContentMetadata } from '@/lib/page-content'
import { getEventsIndexData, CONTENT_FALLBACK } from './index-data'

// EVENTS — the member's own events home. It renders the SAME Marketplace events surface the
// commerce Events tab uses (components/marketplace/events-surface.tsx), on the SAME data + card
// (getEventsIndexData + EventCard), at the SAME /events URL (kept, with its profile link). Both this
// home and the /marketplace/events tab now render the SAME header: identical hero copy plus the shared
// member action cluster (New Event always; Manage + My drafts only once they have added an event), so
// the two surfaces are visually identical. What's unique to this canonical home is the JSON-LD below.
// No business logic is duplicated. No em or en dashes.

// Operator-set title/description also drive <title> + og/twitter cards (PX.2). Kept on /events so the
// URL keeps its SEO — the surface swap does not touch the page's metadata.
export function generateMetadata() {
  return pageContentMetadata('/events', CONTENT_FALLBACK)
}

export default async function EventsPage({
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

  // The member action cluster (New Event always; Manage + My drafts once they have added one), from the
  // SHARED header-actions component so /events and /marketplace/events render an identical hero cluster.
  const actions = (
    <EventsHeaderActions myProfileId={myProfileId} isCrew={isCrew} userHasEvents={userHasEvents} />
  )

  // JSON-LD for the self-canonical /events home only (the /marketplace/events twin canonicals here, so
  // it emits none — the structured data must live on the canonical URL). A BreadcrumbList (Home ->
  // Events) plus an ItemList of the upcoming events, each a nested Event node pointing at its canonical
  // /events/<slug> page. PRIVACY (ADR-186): no venue location is emitted — name + startDate + url +
  // status only. The public events query in getEventsIndexData runs unconditionally, so a signed-out
  // crawler still receives the full public event list here.
  const jsonLd = [
    breadcrumbSchema([
      { name: 'Home', path: '/' },
      { name: 'Events', path: '/events' },
    ]),
    eventsListingSchema(data.sortedEvents, 'Upcoming events near you'),
  ]

  return (
    <>
      <JsonLd data={jsonLd} />
      <EventsSurface
        data={data}
        basePath="/events"
        activeCategory={sp.category}
        actions={actions}
      />
    </>
  )
}
