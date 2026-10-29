// /themes/temple (LIVE-1870): the feature page for the Temple Theme Kit. A Frequency-only route, like
// /themes/nocturne: a static segment wins over /themes/[theme], and app/sitemap.ts already lists the address.
// Static: no request data.
import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { FREQUENCY_PAGE_SEO, frequencyPageJsonLd, frequencyPageMetadata } from '@/lib/seo/frequency-pages'
import { FrequencyTemple } from '@/components/frequency/site/pages/themes/frequency-temple'

export const revalidate = 3600

export const metadata: Metadata = frequencyPageMetadata(FREQUENCY_PAGE_SEO.temple)

export default function TempleThemePage() {
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(FREQUENCY_PAGE_SEO.temple)} />
      <FrequencyTemple />
    </>
  )
}
