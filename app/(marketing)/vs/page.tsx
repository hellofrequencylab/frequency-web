// The /vs index — a small hub linking every "Frequency vs X" comparison page
// (GE11-1). Public marketing chrome, real canonical, breadcrumb + ItemList
// JSON-LD. Voice locked: plain, honest, no em dashes.
import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/jsonld'
import { OG_SITE, ROOT_OG_IMAGES, SITE_NAME, SITE_URL } from '@/lib/site'
import { COMPARISONS, comparisonPath } from '@/lib/marketing/comparisons'
import { FrequencyCompareIndex } from '@/components/frequency/site/pages/funnel/frequency-compare'

export const revalidate = 3600

const TITLE = 'Frequency vs the tools you know'
const DESCRIPTION =
  'How Frequency compares to Meetup, Facebook Groups, Partiful, Eventbrite, and Mighty Networks: a free local Circle that keeps meeting in person, with 0% on your own bookings, plus card processing. Here is every comparison.'

export function generateMetadata(): Metadata {
  const canonical = '/vs'
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

export default function ComparisonsIndexPage() {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([{ name: 'Compare', path: '/vs' }]),
          {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: 'Frequency comparisons',
            numberOfItems: COMPARISONS.length,
            itemListElement: COMPARISONS.map((c, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              url: `${SITE_URL}${comparisonPath(c.slug)}`,
              name: `Frequency vs ${c.name}`,
            })),
          },
        ]}
      />

      <FrequencyCompareIndex />
    </>
  )
}
