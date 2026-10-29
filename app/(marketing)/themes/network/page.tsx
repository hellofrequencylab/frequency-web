// /themes/network (LIVE-1751): the feature page for the Network Theme Kit. A Frequency-only route, like
// /themes/nocturne: a static segment wins over /themes/[theme], and app/sitemap.ts already lists the address.
// Static: no request data.
import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { FREQUENCY_PAGE_SEO, frequencyPageJsonLd, frequencyPageMetadata } from '@/lib/seo/frequency-pages'
import { FrequencyNetwork } from '@/components/frequency/site/pages/themes/frequency-network'

export const revalidate = 3600

export const metadata: Metadata = frequencyPageMetadata(FREQUENCY_PAGE_SEO.network)

export default function NetworkThemePage() {
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(FREQUENCY_PAGE_SEO.network)} />
      <FrequencyNetwork />
    </>
  )
}
