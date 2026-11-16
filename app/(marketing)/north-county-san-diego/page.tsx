import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema, faqSchema } from '@/lib/jsonld'
import { OG_SITE, ROOT_OG_IMAGES, SITE_URL } from '@/lib/site'
import {
  NORTH_COUNTY_DESCRIPTION,
  NORTH_COUNTY_PATH,
  NORTH_COUNTY_TITLE,
  NORTH_COUNTY_TOWNS,
  northCountyFaq,
} from '@/lib/marketing/north-county'
import { FrequencyNorthCounty } from '@/components/frequency/site/pages/north-county/frequency-north-county'

// The always-indexable local page (SCAN-1209). Static copy, so it needs no revalidate window; the sitemap
// lists it regardless of the density floor that keeps the per-town pages noindex on opening day.
export const metadata: Metadata = {
  title: NORTH_COUNTY_TITLE,
  description: NORTH_COUNTY_DESCRIPTION,
  alternates: { canonical: NORTH_COUNTY_PATH },
  openGraph: {
    ...OG_SITE,
    images: ROOT_OG_IMAGES,
    title: NORTH_COUNTY_TITLE,
    description: NORTH_COUNTY_DESCRIPTION,
    url: NORTH_COUNTY_PATH,
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: NORTH_COUNTY_TITLE, description: NORTH_COUNTY_DESCRIPTION },
}

export default function NorthCountyPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Frequency', path: '/' },
            { name: 'North County San Diego', path: NORTH_COUNTY_PATH },
          ]),
          faqSchema(northCountyFaq()),
          {
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: NORTH_COUNTY_TITLE,
            url: `${SITE_URL}${NORTH_COUNTY_PATH}`,
            about: NORTH_COUNTY_TOWNS.map((t) => ({
              '@type': 'City',
              name: t.name,
              url: `${SITE_URL}/discover/cities/${t.slug}`,
            })),
          },
        ]}
      />
      <FrequencyNorthCounty />
    </>
  )
}
