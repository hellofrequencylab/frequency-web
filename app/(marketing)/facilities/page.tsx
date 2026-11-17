// /facilities: the third-spaces vision for partners, investors, civic leaders and press.
// LINK-ONLY (owner 2026-11-17): noindex, out of the nav and app/sitemap.ts, like /how. The body is the
// /vision page #4564 retired, restored here (components/frequency/site/pages/facilities).
import type { Metadata } from 'next'
import { FrequencyFacilities } from '@/components/frequency/site/pages/facilities/frequency-facilities'
import { LINK_ONLY_ROBOTS } from '@/lib/seo/link-only'
import { PrivatePageTracker } from '@/components/frequency/site/shell/private-page-tracker'

export const revalidate = 3600

const TITLE = 'Frequency third spaces'
const DESCRIPTION = 'The vision for Frequency third spaces, for partners, investors, civic leaders and press. The first is planned for 2028.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: LINK_ONLY_ROBOTS,
  openGraph: { title: TITLE, description: DESCRIPTION, url: '/facilities', type: 'website', siteName: 'Frequency', images: ['/brand/frequency/facilities/hall-stage-night.jpg'] },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

export default function FacilitiesPage() {
  return (
    <>
      <FrequencyFacilities />
      <PrivatePageTracker page="/facilities" />
    </>
  )
}
