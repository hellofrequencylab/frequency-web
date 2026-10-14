import type { Metadata } from 'next'
import { SITE_DESIGN } from '@/lib/theme/design'
import { FrequencySpaceConsole } from '@/components/frequency/admin/space-console'

// NOINDEX the entire owner/admin settings surface. Every /spaces/<slug>/settings/** sub-route
// (profile, members, memberships, availability, check-in, QR, email, AND the CRM) is an
// operator-only workspace that holds member rows and tokens. It must never enter a search index
// or an answer engine: a single robots directive on this layout covers every sub-page below it
// (the Metadata API merges robots down the segment tree), so the individual settings pages need no
// edit of their own. Owner-gated server-side anyway; this is the crawl-budget + leak backstop.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

// Under Frequency (ADR-1737) the settings pages sit in the design's Space console shell, like /manage. A
// DAWN build (SITE_DESIGN is build-time) returns the children untouched, as it always has.
export default async function SpaceSettingsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  if (SITE_DESIGN !== 'frequency') return children
  const { slug } = await params
  return <FrequencySpaceConsole slug={slug}>{children}</FrequencySpaceConsole>
}
