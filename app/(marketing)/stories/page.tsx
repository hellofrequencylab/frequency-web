// /stories: Hosts and Spaces in their own words (design_handoff/frequency/templates/website/Stories.html).
//
// A FREQUENCY-ONLY ROUTE. The page exists in the Frequency design's site map and nowhere in DAWN's, so
// a DAWN build answers 404 here (SITE_DESIGN is build-time, so the page still prerenders either way)
// and app/sitemap.ts lists it only under Frequency. Static: no request data.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SITE_DESIGN } from '@/lib/theme/design'
import { JsonLd } from '@/components/json-ld'
import { FREQUENCY_PAGE_SEO, frequencyPageJsonLd, frequencyPageMetadata } from '@/lib/seo/frequency-pages'
import { FrequencyStories } from '@/components/frequency/site/pages/stories/frequency-stories'

export const revalidate = 3600

// Title, description, canonical and share card from the one table (lib/seo/frequency-pages.ts),
// written to the page's visible empty state: there are no stories yet, so the result invites one.
export const metadata: Metadata = frequencyPageMetadata(FREQUENCY_PAGE_SEO.stories)

export default function StoriesPage() {
  if (SITE_DESIGN !== 'frequency') notFound()
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(FREQUENCY_PAGE_SEO.stories)} />
      <FrequencyStories />
    </>
  )
}
