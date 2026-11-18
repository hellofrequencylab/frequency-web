import type { Metadata, Viewport } from 'next'
import { LINK_ONLY_ROBOTS } from '@/lib/seo/link-only'
import { PrivatePageTracker } from '@/components/frequency/site/shell/private-page-tracker'
import { VisionPage } from './vision-page'

// /build/vision: The Frequency Vision, Encinitas. The full plan in seven chapters, for partners.
// LINK-ONLY (owner 2026-11-18): noindex, out of the nav and app/sitemap.ts, listed only on the /build
// index. Generated from the design canvas; see docs/HOW-BRIEF.md.
const TITLE = 'The Frequency Vision · Encinitas'
const DESCRIPTION = 'The full plan for Frequency in Encinitas, in seven chapters: community, platform, open access, the building, the business and the structure. The first Lab opens in 2028.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: LINK_ONLY_ROBOTS,
  openGraph: { title: TITLE, description: DESCRIPTION, url: '/build/vision', type: 'article', siteName: 'Frequency', images: ['/brand/frequency/facilities/biophilic-lounge-day.jpg'] },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
  referrer: 'strict-origin-when-cross-origin',
}

export const viewport: Viewport = { themeColor: '#0A0612', colorScheme: 'dark' } // token-ok: browser chrome colour is a meta tag value, it cannot read a CSS variable

// Static: the page reads no request data (the hash route and the ?r= code are read client-side).
export const dynamic = 'force-static'

export default function BuildVisionPage() {
  return (
    <>
      <VisionPage />
      <PrivatePageTracker page="/build/vision" />
    </>
  )
}
