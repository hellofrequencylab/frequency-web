// The /discover/cities index (GE11-2) — the cities that have crossed the density
// threshold each get a card (the same gate the per-city pages and the sitemap use).
// Since 2026-10-14 it also carries the every-town finder that was /discover/places
// (merged here with a 301): every town with a public Circle or upcoming Event, linking
// to the one town page. Real canonical, breadcrumb + ItemList JSON-LD (the ranked
// cities). Voice locked: plain, no em dashes.
import type { Metadata } from 'next'
import { listDensityCities } from './_data'
import { listDiscoverCities } from './_towns'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/jsonld'
import { OG_SITE, ROOT_OG_IMAGES, SITE_NAME, SITE_URL } from '@/lib/site'
import { FrequencyCitiesIndex } from '@/components/frequency/site/pages/discover/frequency-discover-places'

export const revalidate = 3600

const TITLE = 'Find your people by city'
const DESCRIPTION =
  'The cities where Frequency is taking root: local Circles meeting and real-world events happening near you. Browse by city. Free to join.'

export function generateMetadata(): Metadata {
  const canonical = '/discover/cities'
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical },
    openGraph: {
      ...OG_SITE,
      images: ROOT_OG_IMAGES,
      title: `${TITLE} · ${SITE_NAME}`,
      description: DESCRIPTION,
      url: canonical,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${TITLE} · ${SITE_NAME}`,
      description: DESCRIPTION,
    },
  }
}

export default async function DiscoverCitiesIndexPage() {
  // The every-town list is a courtesy section: a failed read leaves the ranked cities standing.
  const [cities, towns] = await Promise.all([listDensityCities(), listDiscoverCities().catch(() => [])])

  const schema = (
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Discover', path: '/discover' },
            { name: 'Cities', path: '/discover/cities' },
          ]),
          cities.length > 0 && {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: 'Cities on Frequency',
            numberOfItems: cities.length,
            itemListElement: cities.map((c, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              url: `${SITE_URL}/discover/cities/${c.slug}`,
              name: c.city,
            })),
          },
        ].filter(Boolean)}
      />
  )
  return (
    <>
      {schema}
      <FrequencyCitiesIndex cities={cities} towns={towns} />
    </>
  )
}
