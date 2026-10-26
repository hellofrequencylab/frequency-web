import type { Metadata } from 'next'
import { getPublicCircles, getPublicCounts, getPublicEvents } from '@/lib/discover'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, circleListSchema } from '@/lib/jsonld'
import { OG_SITE, ROOT_OG_IMAGES, SITE_NAME } from '@/lib/site'
import { FrequencyCircles } from '@/components/frequency/site/pages/discover/circles'

export const metadata: Metadata = {
  title: 'Local Circles',
  description:
    'Browse local Circles and community groups around a shared activity. Check each listing for meeting times, location and how to join.',
  alternates: { canonical: '/discover/circles' },
  openGraph: {
    ...OG_SITE,
    images: ROOT_OG_IMAGES,
    title: `Local Circles · ${SITE_NAME}`,
    description: 'Browse local Circles and community groups around a shared activity. Check each listing for meeting times, location and how to join.',
    url: '/discover/circles',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Local Circles · ${SITE_NAME}`,
    description: 'Browse local Circles and community groups around a shared activity. Check each listing for meeting times, location and how to join.',
  },
}

export const revalidate = 3600

export default async function DiscoverCirclesPage() {
  const [circles, counts, events] = await Promise.all([
    getPublicCircles(200),
    getPublicCounts(),
    getPublicEvents(50),
  ])
  const schema = [
    breadcrumbSchema([
      { name: 'Discover', path: '/discover' },
      { name: 'Circles', path: '/discover/circles' },
    ]),
    circleListSchema(circles, 'Local Circles on Frequency'),
  ]
  return (
    <>
      <JsonLd data={schema} />
      <FrequencyCircles circles={circles} counts={counts} events={events.length} />
    </>
  )
}
