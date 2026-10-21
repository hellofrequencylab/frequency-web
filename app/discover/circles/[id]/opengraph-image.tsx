import { getPublicCircle } from '@/lib/discover'
import { SITE_NAME } from '@/lib/site'
import { stageCardResponse } from '@/lib/og/stage-card'
import { OG_CONTENT_TYPE } from '@/lib/og/content-type'

export const runtime = 'nodejs'
export const alt = `A circle on ${SITE_NAME}`
export const size = { width: 1200, height: 630 }
// JPEG, not PNG. next/og emits lossless PNG, and a photographic 1200x630 card measures
// ~1,776KB that way against ~151KB as JPEG. cardResponse re-encodes and adds the CDN
// cache headers (lib/og/deliver.ts).
export const contentType = OG_CONTENT_TYPE

// Per-circle dynamic OG image for /discover/circles/[id] (site-audit SEO-2). Falls back to a
// generic branded card when the circle isn't found.
//
// ⚠️ RESOLVES slug-OR-id, and it HAS to (LIVE-182). This route receives the same segment the page
// does, and that segment is now the slug. A by-id-only read would hand a slug to an RPC typed
// `_id uuid`, fail, and fall through to the generic card — every share of a public Circle losing
// its name, silently, because the fallback is indistinguishable from "circle not found". The look is the shared Stage card; it was once drawn to mirror the practices /
// events cards: near-black gradient ground, indigo brand bar, white display type.
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const circle = await getPublicCircle(id).catch(() => null)

  const title = circle?.name ?? 'Circles'
  const where = circle?.city ?? null
  const isFallback = !circle

  const members = circle && circle.member_count > 0 ? `${circle.member_count} ${circle.member_count === 1 ? 'member' : 'members'}` : null

  return stageCardResponse({
    kicker: 'Circle',
    title,
    line: circle?.about ?? (isFallback ? `Circles on ${SITE_NAME}` : `A circle on ${SITE_NAME}`),
    meta: [where, members].filter(Boolean).join(' · ') || null,
  })
}
