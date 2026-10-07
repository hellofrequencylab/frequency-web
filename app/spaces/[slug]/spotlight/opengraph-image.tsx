import SpaceCard from '@/app/(public)/spaces/[slug]/opengraph-image'
import { OG_CONTENT_TYPE } from '@/lib/og/content-type'
import { SITE_NAME } from '@/lib/site'

export const runtime = 'nodejs'
export const alt = `A spotlight on ${SITE_NAME}`
export const size = { width: 1200, height: 630 }
export const contentType = OG_CONTENT_TYPE

// The share card for a Space's Spotlight (LIVE-853): the SAME card the Space profile shares (cover, logo,
// name, tagline, with the identity-free fallback for a private Space), so a link-in-bio post previews as
// the Space it opens. The Spotlight route sits outside the (public) group, so it does not inherit that
// segment's card and names it here; one module, so the two cards cannot drift.
export default function Image({ params }: { params: Promise<{ slug: string }> }) {
  return SpaceCard({ params })
}
