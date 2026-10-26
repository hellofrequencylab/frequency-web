import type { Metadata } from 'next'
import { JsonLd } from '@/components/json-ld'
import { breadcrumbSchema } from '@/lib/jsonld'
import { loadPricingInput } from '@/lib/pricing/pricing-input'
import { getFunnelConfig, funnelSlugs } from '@/lib/marketing/funnel-config'
import { OG_SITE, ROOT_OG_IMAGES } from '@/lib/site'
import { FrequencyForIndex } from '@/components/frequency/site/pages/funnel/frequency-for-index'

// The index of the six operator doors, so /for is a real page. It sits in the (marketing) group, so it
// wears the standard site header and footer (the doors themselves stay chrome-free, ADR-591). A Frequency
// route, like /networks, and the sitemap lists it.
export const revalidate = 3600

const TITLE = 'Software for coaches, studios, hosts, venues, Non Profits and networks'
const DESCRIPTION =
  'Pick the door that fits how you work. Frequency gives coaches, studios, event hosts, venues, Non Profits and networks one home for bookings, members and events in North County San Diego.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/for' },
  openGraph: { ...OG_SITE, images: ROOT_OG_IMAGES, title: TITLE, description: DESCRIPTION, url: '/for', type: 'website' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

export default async function ForIndexPage() {
  const input = await loadPricingInput()
  const doors = funnelSlugs()
    .map((slug) => getFunnelConfig(slug, input))
    .flatMap((c) => (c ? [c] : []))
  return (
    <>
      <JsonLd data={[breadcrumbSchema([{ name: 'Frequency', path: '/' }, { name: 'For your work', path: '/for' }])]} />
      <FrequencyForIndex doors={doors} />
    </>
  )
}
