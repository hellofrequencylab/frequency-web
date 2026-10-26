import type { Metadata } from 'next'
import { getPublicEvents, getPublicCounts } from '@/lib/discover'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, eventListSchema } from '@/lib/jsonld'
import { OG_SITE, ROOT_OG_IMAGES, SITE_NAME } from '@/lib/site'
import { dayInZone, HOME_TZ } from '@/lib/time/zone'
import { getCityCategoryHubs } from './_data'
import { FrequencyDiscoverEvents } from '@/components/frequency/site/pages/discover/frequency-discover-events'

export const metadata: Metadata = {
  title: 'Upcoming events',
  description:
    'Browse community events and local gatherings on Frequency. Check the date, activity, availability and how to take part before you go.',
  alternates: { canonical: '/discover/events' },
  openGraph: {
    ...OG_SITE,
    images: ROOT_OG_IMAGES,
    title: `Upcoming events · ${SITE_NAME}`,
    description: 'Browse community events and local gatherings on Frequency. Check the date, activity, availability and how to take part before you go.',
    url: '/discover/events',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Upcoming events · ${SITE_NAME}`,
    description: 'Browse community events and local gatherings on Frequency. Check the date, activity, availability and how to take part before you go.',
  },
}

export const revalidate = 3600

export default async function DiscoverEventsPage() {
  const [events, counts] = await Promise.all([
    getPublicEvents(50),
    getPublicCounts(),
  ])
  const hubs = await getCityCategoryHubs().catch(() => [])
  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Discover', path: '/discover' },
            { name: 'Events', path: '/discover/events' },
          ]),
          eventListSchema(events, 'Upcoming events on Frequency'),
        ]}
      />
      <FrequencyDiscoverEvents
        events={events}
        counts={counts}
        today={dayInZone(new Date(), HOME_TZ)}
        townTypes={hubs.map((h) => ({
          href: `/discover/events/in/${h.citySlug}/${h.category.slug}`,
          label: `${h.category.label} in ${h.city}`,
          count: h.events.length,
        }))}
      />
    </>
  )
}
