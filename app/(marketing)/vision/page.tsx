// /vision: third spaces, for partners, investors, civic leaders and press
// (design_handoff/frequency/templates/website/Vision.html). The Lab stays in the future tense
// (ADR-1735, LIVE-912); /the-lab is the full plan and this page points at it.
//
// A FREQUENCY-ONLY ROUTE, like /stories: a DAWN build answers 404 here and app/sitemap.ts lists it only
// under Frequency. Static: no request data.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SITE_DESIGN } from '@/lib/theme/design'
import { OG_SITE, ROOT_OG_IMAGES } from '@/lib/site'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/jsonld'
import { FrequencyVision } from '@/components/frequency/site/pages/vision/frequency-vision'

export const revalidate = 3600

const TITLE = 'Vision: when a community is ready, it earns a home'
const DESCRIPTION =
  'For partners, investors, civic leaders and press: the vision for Frequency third spaces. The first is planned for 2028, and nothing is bookable yet.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/vision' },
  openGraph: { ...OG_SITE, images: ROOT_OG_IMAGES, title: TITLE, description: DESCRIPTION, url: '/vision', type: 'website' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

export default function VisionPage() {
  if (SITE_DESIGN !== 'frequency') notFound()
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: 'Vision', path: '/vision' }])} />
      <FrequencyVision />
    </>
  )
}
