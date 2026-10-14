// /vision: third spaces, for partners, investors, civic leaders and press
// (design_handoff/frequency/templates/website/Vision.html). The Lab stays in the future tense
// (ADR-1735, LIVE-912). /the-lab merged in here (owner ruling 2026-10-14): its plan and FAQ are
// sections of this page, and the old URL 301s here.
//
// A FREQUENCY-ONLY ROUTE, like /stories: a DAWN build answers 404 here and app/sitemap.ts lists it only
// under Frequency. Static: no request data.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SITE_DESIGN } from '@/lib/theme/design'
import { JsonLd } from '@/components/json-ld'
import { FREQUENCY_PAGE_SEO, frequencyPageJsonLd, frequencyPageMetadata } from '@/lib/seo/frequency-pages'
import { FrequencyVision } from '@/components/frequency/site/pages/vision/frequency-vision'

export const revalidate = 3600

// Title, description, canonical and share card from the one table (lib/seo/frequency-pages.ts),
// unchanged from what this route shipped with.
export const metadata: Metadata = frequencyPageMetadata(FREQUENCY_PAGE_SEO.vision)

export default function VisionPage() {
  if (SITE_DESIGN !== 'frequency') notFound()
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(FREQUENCY_PAGE_SEO.vision)} />
      <FrequencyVision />
    </>
  )
}
