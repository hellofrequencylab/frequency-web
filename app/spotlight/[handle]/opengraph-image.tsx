import { getPublishedSpotlight } from '@/lib/spotlight/data'
import { SITE_NAME } from '@/lib/site'
import { stageCardResponse } from '@/lib/og/stage-card'
import { OG_CONTENT_TYPE } from '@/lib/og/content-type'

export const runtime = 'nodejs'
export const alt = `A spotlight on ${SITE_NAME}`
export const size = { width: 1200, height: 630 }
// JPEG, not PNG. next/og emits lossless PNG, and a photographic 1200x630 card measures
// ~1,776KB that way against ~151KB as JPEG. cardResponse re-encodes and adds the CDN
// cache headers (lib/og/deliver.ts).
export const contentType = OG_CONTENT_TYPE

// Per-spotlight dynamic OG card for /spotlight/[handle] (site-audit SEO-8): an indexable person
// page that was sharing only the raw avatar (or the generic site card). Falls back to a generic
// branded card when the spotlight isn't published. Mirrors the practices / circles OG language.
export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const data = await getPublishedSpotlight(handle).catch(() => null)

  const name = data?.profile.display_name || (data ? `@${data.profile.handle}` : 'Spotlight')
  const isFallback = !data

  return stageCardResponse({
    kicker: 'Spotlight',
    title: name,
    line: data?.profile.bio ?? (isFallback ? `Spotlights on ${SITE_NAME}` : `A spotlight on ${SITE_NAME}`),
    // The member's own avatar rides the chip, never the full-bleed slot: a small profile photo
    // stretched across 1200x630 reads as a smear.
    logoUrl: data?.profile.avatar_url ?? null,
    initials: data ? name.replace(/^@/, '').slice(0, 2).toUpperCase() : null,
  })
}
