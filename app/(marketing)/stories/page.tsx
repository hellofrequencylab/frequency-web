// /stories: Hosts and Spaces in their own words (design_handoff/frequency/templates/website/Stories.html).
//
// A Frequency-only route: the page exists in the Frequency design's site map and app/sitemap.ts lists
// it. Static: no request data.
import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { FREQUENCY_PAGE_SEO, frequencyPageJsonLd, frequencyPageMetadata } from '@/lib/seo/frequency-pages'
import { FrequencyStories } from '@/components/frequency/site/pages/stories/frequency-stories'

export const revalidate = 3600

// Title, description, canonical and share card from the one table (lib/seo/frequency-pages.ts),
// written to the page's visible empty state: there are no stories yet, so the result invites one.
export const metadata: Metadata = frequencyPageMetadata(FREQUENCY_PAGE_SEO.stories)

export default function StoriesPage() {
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(FREQUENCY_PAGE_SEO.stories)} />
      <FrequencyStories />
    </>
  )
}
