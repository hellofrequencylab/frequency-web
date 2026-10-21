import { getPillars } from '@/lib/pillars'
import { SITE_NAME } from '@/lib/site'
import { stageCardResponse } from '@/lib/og/stage-card'
import { OG_CONTENT_TYPE } from '@/lib/og/content-type'

export const runtime = 'nodejs'
export const alt = `Practices by pillar on ${SITE_NAME}`
export const size = { width: 1200, height: 630 }
// JPEG, not PNG. next/og emits lossless PNG, and a photographic 1200x630 card measures
// ~1,776KB that way against ~151KB as JPEG. cardResponse re-encodes and adds the CDN
// cache headers (lib/og/deliver.ts).
export const contentType = OG_CONTENT_TYPE

// Per-pillar dynamic OG image for /discover/practices/pillar/[slug].
// Falls back to a generic branded card when the pillar isn't found.
// Visual language mirrors app/discover/events/[slug]/opengraph-image.tsx:
// near-black gradient ground, amber brand bar (#E2912F), white display type.

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const pillars = await getPillars().catch(() => [])
  const pillar = pillars.find((p) => p.slug === slug) ?? null

  const pillarName = pillar?.name ?? null
  const title = pillarName ? `${pillarName} Practices` : 'Practices'
  const isFallback = !pillar

  return stageCardResponse({
    kicker: 'Practice pillar',
    title,
    line: pillar?.description ?? (isFallback ? `Practices on ${SITE_NAME}` : `${SITE_NAME} practice library`),
  })
}
