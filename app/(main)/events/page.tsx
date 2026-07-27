import { EventsSurface } from '@/components/marketplace/events-surface'
import { EventsHeaderActions } from '@/components/marketplace/events-header-actions'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, eventsListingSchema } from '@/lib/jsonld'
import { pageContentMetadata } from '@/lib/page-content'
import { getEventsIndexData, CONTENT_FALLBACK } from './index-data'

// EVENTS — the one events home, for members and for the commerce hub alike. The hub's Events tab
// links here and the old /marketplace/events twin 308-redirects here (ADR-866; it rendered this
// exact surface on this exact data and already canonicaled here). The shared composition lives in
// components/marketplace/events-surface.tsx (getEventsIndexData + EventCard), topped by the member
// action cluster (New Event always; Manage + My drafts only once they have added an event). What's
// unique to this canonical home is the JSON-LD below. No business logic is duplicated. No em or en
// dashes.

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

  // The member action cluster (New Event always; Manage + My drafts once they have added one), from
  // the shared header-actions component.
  const actions = (
    <EventsHeaderActions myProfileId={myProfileId} isCrew={isCrew} userHasEvents={userHasEvents} />
  )

  // JSON-LD for the self-canonical /events home (the one events URL; the structured data lives on
  // the canonical). A BreadcrumbList (Home ->
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
