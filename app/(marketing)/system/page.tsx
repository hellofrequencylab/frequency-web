// /system (LIVE-1562): the whole system in one story. Frequency-only, like /themes. The pricing facts read the
// operator's pricing input (loadPricingInput), the same one /pricing and the /for doors read, so an edit at
// /admin/pricing moves this page too. app/sitemap.ts lists it.
import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { FREQUENCY_PAGE_SEO, frequencyPageJsonLd, frequencyPageMetadata } from '@/lib/seo/frequency-pages'
import { FrequencySystem } from '@/components/frequency/site/pages/system/frequency-system'
import { loadPricingInput } from '@/lib/pricing/pricing-input'

export const revalidate = 3600

export const metadata: Metadata = frequencyPageMetadata(FREQUENCY_PAGE_SEO.system)

export default async function SystemPage() {
  const input = await loadPricingInput()
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(FREQUENCY_PAGE_SEO.system)} />
      <FrequencySystem input={input} />
    </>
  )
}
