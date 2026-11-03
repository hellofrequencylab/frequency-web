// /themes/new-world (LIVE-2059): the feature page for the New World theme. A Frequency-only route, like /themes/nocturne: a static
// segment wins over /themes/[theme]. Static: no request data. New World is hidden from the pickers until it is un-hidden, so the page
// is not in the sitemap and tells search engines to leave it out; whoever un-hides the theme removes both.
import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { FREQUENCY_PAGE_SEO, frequencyPageJsonLd, frequencyPageMetadata } from '@/lib/seo/frequency-pages'
import { FrequencyNewWorld } from '@/components/frequency/site/pages/themes/frequency-new-world'

export const revalidate = 3600

export const metadata: Metadata = { ...frequencyPageMetadata(FREQUENCY_PAGE_SEO.newWorld), robots: { index: false, follow: false } }

export default function NewWorldThemePage() {
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(FREQUENCY_PAGE_SEO.newWorld)} />
      <FrequencyNewWorld />
    </>
  )
}
