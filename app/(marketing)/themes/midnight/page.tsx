// /themes/midnight (LIVE-1380): the feature page for the Midnight mega theme. A Frequency-only route, like
// /networks. app/sitemap.ts lists it. Static: no request data.
import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { FREQUENCY_PAGE_SEO, frequencyPageJsonLd, frequencyPageMetadata } from '@/lib/seo/frequency-pages'
import { FrequencyMidnight } from '@/components/frequency/site/pages/themes/frequency-midnight'

export const revalidate = 3600

export const metadata: Metadata = frequencyPageMetadata(FREQUENCY_PAGE_SEO.midnight)

export default function MidnightThemePage() {
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(FREQUENCY_PAGE_SEO.midnight)} />
      <FrequencyMidnight />
    </>
  )
}
