import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { JsonLd } from '@/components/json-ld'
import { FREQUENCY_PAGE_SEO, frequencyPageJsonLd, frequencyPageMetadata } from '@/lib/seo/frequency-pages'
import { SITE_DESIGN } from '@/lib/theme/design'
import { FrequencyFeatures } from '@/components/frequency/site/pages/features/frequency-features'

// /features: every feature for both sides of the door (design_handoff/frequency/templates/website/
// Features.html). A FREQUENCY-ONLY route: the design's Home, People and Spaces pages link into its
// anchors (#f-zaps, #f-doorqr, ...), and DAWN has no such page and links nowhere here, so under DAWN it
// answers 404 rather than inventing a DAWN body. The sitemap advertises it only under Frequency for the
// same reason (app/sitemap.ts).
//
// Static: no request reads. The page carries no data, so it prerenders once per deploy.

// Title, description, canonical and share card from the one table (lib/seo/frequency-pages.ts),
// unchanged from what this route shipped with.
export const metadata: Metadata = frequencyPageMetadata(FREQUENCY_PAGE_SEO.features)

export default function FeaturesPage() {
  if (SITE_DESIGN !== 'frequency') notFound()
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(FREQUENCY_PAGE_SEO.features)} />
      <FrequencyFeatures />
    </>
  )
}
