import type { Metadata } from 'next'
import { listPublicJourneys } from '@/lib/journey-plans'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, journeyListSchema } from '@/lib/jsonld'
import { OG_SITE, ROOT_OG_IMAGES, SITE_NAME } from '@/lib/site'
import { FrequencyJourneys } from '@/components/frequency/site/pages/discover/journeys'

export const metadata: Metadata = {
  title: 'Journeys',
  description:
    'Browse Journeys on Frequency. A Journey is part of The Quest: an ordered set of small daily Practices you run for a season, solo or with your Circle.',
  alternates: { canonical: '/discover/journeys' },
  openGraph: {
    ...OG_SITE,
    images: ROOT_OG_IMAGES,
    title: `Journeys · ${SITE_NAME}`,
    description:
      'A Journey is an ordered set of small daily Practices you run for a season, solo or with your Circle.',
    url: '/discover/journeys',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Journeys · ${SITE_NAME}`,
    description:
      'A Journey is an ordered set of small daily Practices you run for a season, solo or with your Circle.',
  },
}

export const revalidate = 3600

export default async function DiscoverJourneysPage() {
  const journeys = await listPublicJourneys()
  const schema = [
    breadcrumbSchema([
      { name: 'Discover', path: '/discover' },
      { name: 'Journeys', path: '/discover/journeys' },
    ]),
    journeyListSchema(journeys, 'Journeys on Frequency'),
  ]
  return (
    <>
      <JsonLd data={schema} />
      <FrequencyJourneys journeys={journeys} />
    </>
  )
}
