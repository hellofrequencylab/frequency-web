// /networks: the page for one organization running many chapters, the Network plan (SCAN-961, owner
// ruling 2026-10-15). A Frequency-only route, like /vision.
// app/sitemap.ts lists it. Static: no request data.
import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { FREQUENCY_PAGE_SEO, frequencyPageJsonLd, frequencyPageMetadata } from '@/lib/seo/frequency-pages'
import { FrequencyNetworks } from '@/components/frequency/site/pages/networks/frequency-networks'

export const revalidate = 3600

export const metadata: Metadata = frequencyPageMetadata(FREQUENCY_PAGE_SEO.networks)

export default function NetworksPage() {
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(FREQUENCY_PAGE_SEO.networks)} />
      <FrequencyNetworks />
    </>
  )
}
