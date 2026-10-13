import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/jsonld'
import { OG_SITE, ROOT_OG_IMAGES } from '@/lib/site'
import { SITE_DESIGN } from '@/lib/theme/design'
import { FrequencyFeatures } from '@/components/frequency/site/pages/features/frequency-features'

// /features: every feature for both sides of the door (design_handoff/frequency/templates/website/
// Features.html). A FREQUENCY-ONLY route: the design's Home, People and Spaces pages link into its
// anchors (#f-zaps, #f-doorqr, ...), and DAWN has no such page and links nowhere here, so under DAWN it
// answers 404 rather than inventing a DAWN body. The sitemap advertises it only under Frequency for the
// same reason (app/sitemap.ts).
//
// Static: no request reads. The page carries no data, so it prerenders once per deploy.

const DESCRIPTION =
  'Everything Frequency does for people and Spaces, from the town calendar to door check-in, programs and payouts.'

export const metadata: Metadata = {
  title: 'Features',
  description: DESCRIPTION,
  alternates: { canonical: '/features' },
  openGraph: { ...OG_SITE, images: ROOT_OG_IMAGES, title: 'Features · Frequency', description: DESCRIPTION, url: '/features' },
  twitter: { card: 'summary_large_image', title: 'Features · Frequency', description: DESCRIPTION },
}

export default function FeaturesPage() {
  if (SITE_DESIGN !== 'frequency') notFound()
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: 'Features', path: '/features' }])} />
      <FrequencyFeatures />
    </>
  )
}
