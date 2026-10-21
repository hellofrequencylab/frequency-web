import { getPublicJourney } from '@/lib/journey-plans'
import { SITE_NAME } from '@/lib/site'
import { stageCardResponse } from '@/lib/og/stage-card'
import { OG_CONTENT_TYPE } from '@/lib/og/content-type'

export const runtime = 'nodejs'
export const alt = `A guided Journey on ${SITE_NAME}`
export const size = { width: 1200, height: 630 }
// JPEG, not PNG. next/og emits lossless PNG, and a photographic 1200x630 card measures
// ~1,776KB that way against ~151KB as JPEG. cardResponse re-encodes and adds the CDN
// cache headers (lib/og/deliver.ts).
export const contentType = OG_CONTENT_TYPE

// Per-Journey dynamic OG image for /discover/journeys/[slug] (site-audit SEO-3) — a primary
// HowTo/AIO surface that was sharing the generic site card. Falls back to a generic branded
// card when the Journey isn't found. Mirrors the practices / circles OG language.
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const found = await getPublicJourney(slug).catch(() => null)
  const plan = found?.plan ?? null

  const title = plan?.title ?? 'Journeys'
  const isFallback = !plan

  return stageCardResponse({
    kicker: 'Journey',
    title,
    line: plan?.summary ?? (isFallback ? `Journeys on ${SITE_NAME}` : `A guided Journey on ${SITE_NAME}`),
    coverUrl: plan?.cover_image ?? null,
    coverFocus: plan?.cover_focus ?? null,
  })
}
