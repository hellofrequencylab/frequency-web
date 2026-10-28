// /themes/designer (LIVE-1743): the feature page for the Designer Theme Kit. A Frequency-only route, like
// /themes/nocturne: a static segment wins over /themes/[theme], and app/sitemap.ts already lists the address.
// Static: no request data. The two Designer faces load here, on this page only, for the Type card's specimen.
import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { FREQUENCY_PAGE_SEO, frequencyPageJsonLd, frequencyPageMetadata } from '@/lib/seo/frequency-pages'
import { DESIGNER_FONT_CLASS } from '@/components/sites/designer-fonts'
import { FrequencyDesigner } from '@/components/frequency/site/pages/themes/frequency-designer'

export const revalidate = 3600

export const metadata: Metadata = frequencyPageMetadata(FREQUENCY_PAGE_SEO.designer)

export default function DesignerThemePage() {
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(FREQUENCY_PAGE_SEO.designer)} />
      <div className={DESIGNER_FONT_CLASS}>
        <FrequencyDesigner />
      </div>
    </>
  )
}
