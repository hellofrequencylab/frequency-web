import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { FREQUENCY_PAGE_SEO, frequencyPageJsonLd, frequencyPageMetadata } from '@/lib/seo/frequency-pages'
import { FrequencyFeatures } from '@/components/frequency/site/pages/features/frequency-features'

// /features: every feature for both sides of the door (design_handoff/frequency/templates/website/
// Features.html). A Frequency-only route: the design's Home, People and Spaces pages link into its
// anchors (#f-zaps, #f-doorqr, ...). The sitemap lists it (app/sitemap.ts).
//
// Static: no request reads. The page carries no data, so it prerenders once per deploy.

// Title, description, canonical and share card from the one table (lib/seo/frequency-pages.ts),
// unchanged from what this route shipped with.
export const metadata: Metadata = frequencyPageMetadata(FREQUENCY_PAGE_SEO.features)

export default function FeaturesPage() {
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(FREQUENCY_PAGE_SEO.features)} />
      <FrequencyFeatures />
    </>
  )
}
