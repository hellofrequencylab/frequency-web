// /themes/new-world (LIVE-2059): the feature page for the New World theme. A Frequency-only route, like /themes/nocturne: a static
// segment wins over /themes/[theme]. Static: no request data. Public and in the sitemap since New World joined the pickers.
import type { Metadata } from 'next'
import { RememberKit } from '@/components/frequency/site/pages/themes/remember-kit'
import { JsonLd } from '@/components/json-ld'
import { FREQUENCY_PAGE_SEO, frequencyPageJsonLd, frequencyPageMetadata } from '@/lib/seo/frequency-pages'
import { FrequencyNewWorld } from '@/components/frequency/site/pages/themes/frequency-new-world'

export const revalidate = 3600

export const metadata: Metadata = frequencyPageMetadata(FREQUENCY_PAGE_SEO.newWorld)

export default function NewWorldThemePage() {
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(FREQUENCY_PAGE_SEO.newWorld)} />
      <RememberKit kit="new-world" />
      <FrequencyNewWorld />
    </>
  )
}
