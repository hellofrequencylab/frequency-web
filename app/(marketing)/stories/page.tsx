// /stories: Hosts and Spaces in their own words (design_handoff/frequency/templates/website/Stories.html).
//
// A FREQUENCY-ONLY ROUTE. The page exists in the Frequency design's site map and nowhere in DAWN's, so
// a DAWN build answers 404 here (SITE_DESIGN is build-time, so the page still prerenders either way)
// and app/sitemap.ts lists it only under Frequency. Static: no request data.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SITE_DESIGN } from '@/lib/theme/design'
import { OG_SITE, ROOT_OG_IMAGES } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/jsonld'
import { FrequencyStories } from '@/components/frequency/site/pages/stories/frequency-stories'

export const revalidate = 3600

const TITLE = 'Stories: Hosts and Spaces in their own words'
const DESCRIPTION = 'Real Hosts and Spaces on Frequency, in their own words. Every story ends in a community you can join.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/stories' },
  openGraph: { ...OG_SITE, images: ROOT_OG_IMAGES, title: TITLE, description: DESCRIPTION, url: '/stories', type: 'website' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

export default function StoriesPage() {
  if (SITE_DESIGN !== 'frequency') notFound()
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: 'Stories', path: '/stories' }])} />
      <FrequencyStories />
    </>
  )
}
