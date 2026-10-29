// /themes/designer (LIVE-1743): the feature page for the Designer Theme Kit. A Frequency-only route, like
// /themes/nocturne: a static segment wins over /themes/[theme], and app/sitemap.ts already lists the address.
// Static: no request data.
import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { FREQUENCY_PAGE_SEO, frequencyPageJsonLd, frequencyPageMetadata } from '@/lib/seo/frequency-pages'
import { FrequencyDesigner } from '@/components/frequency/site/pages/themes/frequency-designer'

export const revalidate = 3600

export const metadata: Metadata = frequencyPageMetadata(FREQUENCY_PAGE_SEO.designer)

export default function DesignerThemePage() {
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(FREQUENCY_PAGE_SEO.designer)} />
      <FrequencyDesigner />
    </>
  )
}
