// /free-spotlight (VLS-05): the landing for the "Get a Free Spotlight" button. Dark (404) until
// LAUNCH_ENTRY_ENABLED is on. Not in the sitemap or any menu while it is dark. Static, no request data.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { JsonLd } from '@/components/json-ld'
import { FREQUENCY_PAGE_SEO, frequencyPageJsonLd, frequencyPageMetadata } from '@/lib/seo/frequency-pages'
import { launchEntryEnabled } from '@/lib/launch/enabled'
import { FreeSpotlightLanding } from '@/components/frequency/site/pages/launch/free-spotlight'

export const revalidate = 3600

export const metadata: Metadata = frequencyPageMetadata(FREQUENCY_PAGE_SEO.freeSpotlight)

export default function FreeSpotlightPage() {
  if (!launchEntryEnabled()) notFound()
  return (
    <>
      <JsonLd data={frequencyPageJsonLd(FREQUENCY_PAGE_SEO.freeSpotlight)} />
      <FreeSpotlightLanding />
    </>
  )
}
