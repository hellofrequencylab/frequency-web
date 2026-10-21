import { getPublicPractice } from '@/lib/practices'
import { SITE_NAME } from '@/lib/site'
import { stageCardResponse } from '@/lib/og/stage-card'
import { OG_CONTENT_TYPE } from '@/lib/og/content-type'

export const runtime = 'nodejs'
export const alt = `A practice on ${SITE_NAME}`
export const size = { width: 1200, height: 630 }
// JPEG, not PNG. next/og emits lossless PNG, and a photographic 1200x630 card measures
// ~1,776KB that way against ~151KB as JPEG. cardResponse re-encodes and adds the CDN
// cache headers (lib/og/deliver.ts).
export const contentType = OG_CONTENT_TYPE

// Per-practice dynamic OG image for /discover/practices/[id].
// Falls back to a generic branded card when the practice isn't found.
// Visual language mirrors app/discover/events/[slug]/opengraph-image.tsx:
// near-black gradient ground, amber brand bar (#E2912F), white display type.

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const practice = await getPublicPractice(id).catch(() => null)

  const title = practice?.title ?? 'Practices'
  const subcategory = practice?.subcategory?.name ?? null
  const isFallback = !practice

  return stageCardResponse({
    kicker: subcategory ?? 'Practice',
    title,
    line: practice?.summary ?? (isFallback ? `Practices on ${SITE_NAME}` : `A practice on ${SITE_NAME}`),
    coverUrl: practice?.header_image ?? null,
  })
}
