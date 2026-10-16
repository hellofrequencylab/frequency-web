// /networks: the page for one organization running many chapters, the Network plan (SCAN-961, owner
// ruling 2026-10-15). A FREQUENCY-ONLY ROUTE, like /vision: a DAWN build answers 404 here and
// app/sitemap.ts lists it only under Frequency. Static: no request data.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SITE_DESIGN } from '@/lib/theme/design'
import { JsonLd } from '@/components/json-ld'
import { FREQUENCY_PAGE_SEO, frequencyPageJsonLd, frequencyPageMetadata } from '@/lib/seo/frequency-pages'
import { FrequencyNetworks } from '@/components/frequency/site/pages/networks/frequency-networks'

export const revalidate = 3600

export const metadata: Metadata = frequencyPageMetadata(FREQUENCY_PAGE_SEO.networks)

export default function NetworksPage() {
  if (SITE_DESIGN !== 'frequency') notFound()
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(FREQUENCY_PAGE_SEO.networks)} />
      <FrequencyNetworks />
    </>
  )
}
