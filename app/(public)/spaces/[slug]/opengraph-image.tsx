import { getSpaceBySlug, getSpaceVisibility } from '@/lib/spaces/store'
import { readHeroConfig, resolveHero } from '@/lib/spaces/hero-config'
import { defaultPrimaryCtaLabel } from '@/lib/spaces/profile-config'
import { coverPlaceholderFor } from '@/lib/spaces/cover-placeholder'
import { spaceTypeLabel } from '@/components/spaces/space-type'
import { coverPlaceholderDataUrl } from '@/lib/og/local-image'
import { stageCardResponse } from '@/lib/og/stage-card'
import { OG_CONTENT_TYPE } from '@/lib/og/content-type'
import { SITE_NAME } from '@/lib/site'

export const runtime = 'nodejs'
export const alt = `A space on ${SITE_NAME}`
export const size = { width: 1200, height: 630 }
// JPEG, not PNG. This card puts the entity's cover across the full 1200x630 canvas, and
// next/og emits lossless PNG: 1,776KB measured, against 151KB as JPEG. cardResponse
// re-encodes and adds the CDN cache headers (lib/og/deliver.ts).
export const contentType = OG_CONTENT_TYPE

// Per-Space dynamic OG image (SEO/AIO) — the share card for /spaces/<slug> and every business
// sub-page under it (/book, custom pages, community, reviews all inherit this segment's image), and
// the `image` in the Space JSON-LD. It MIRRORS THE ON-PAGE HERO: the Space's cover photo as the
// background (a Space with no cover gets the SAME deterministic site placeholder the page shows,
// via the shared lib/spaces/cover-placeholder), the ink legibility scrim, the logo chip layered on
// top, and the identity lockup — type badge, name, tagline — resolved through the SAME resolveHero
// helper the profile chrome renders from, so the card and the page can never tell two stories.
//
// PRIVACY (unchanged contract): a PRIVATE Space (or a missing / inactive one) renders the neutral
// brand card with NO name, type, cover, or logo, so a shared link to a noindex private profile never
// leaks its identity through the image. Brand identity only — never member data.
//
// The look is the shared Stage card (lib/og/stage-card.tsx): the dark Stage theme, Unbounded title,
// the cover full-bleed under the Stage scrim, the logo chip bottom-left. This route owns the data, the
// privacy gate and the hero resolution; the layout owns nothing else.
//
// Build-time assets under public/ are inlined through lib/og/local-image.ts (Satori needs bytes,
// not a relative URL). ⚠️ NOT a `readFile` in this file: a path built from a variable is
// unresolvable to @vercel/nft, which then globs the whole of public/ into every function under
// this segment — measured at 12.25 MB apiece, against 2.37 MB now. See that module's header.

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [space, visibility] = await Promise.all([getSpaceBySlug(slug), getSpaceVisibility(slug)])

  // Only a NETWORK (public), active Space reveals its brand on the card. Anything else falls back to
  // a neutral, identity-free card (no leak for a private space).
  const isPublic = !!space && space.status === 'active' && visibility !== 'private'

  if (!isPublic || !space) {
    return stageCardResponse({
      kicker: SITE_NAME,
      title: `A space on ${SITE_NAME}`,
      line: `A community on ${SITE_NAME}`,
    })
  }

  // ── The public hero card: the SAME resolution path the page hero runs. ──────────────────────────
  const brandName = space.brandName?.trim() || space.name
  const hero = resolveHero({
    config: readHeroConfig(space.preferences),
    preferences: space.preferences,
    base: `/spaces/${space.slug}`,
    brandName,
    tagline: space.tagline ?? null,
    defaultCtaLabel: defaultPrimaryCtaLabel(space.type),
  })
  // The operator's own hex when set (brand_accent also admits token NAMES, which Satori cannot
  // resolve: only a literal hex passes the card's own check).
  const initials = brandName
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  // Cover: the real upload (fetched + inlined, fail-safe) or the page hero's own deterministic
  // placeholder, the same photo the page shows. Logo: the real upload or an initials chip.
  // 2026-09-05 (LIVE-155): a webp upload used to crash Satori; the guard lives at the read site
  // (lib/og/remote-image.ts), which returns null for any type Satori cannot size, so the placeholder
  // cover or the initials chip carries the card. Proven by opengraph-image.test.tsx beside this file.
  return stageCardResponse({
    kicker: spaceTypeLabel(space.type),
    title: hero.heading,
    line: hero.tagline,
    coverUrl: space.coverImageUrl,
    coverPlaceholder: await coverPlaceholderDataUrl(coverPlaceholderFor(space.id)),
    logoUrl: space.brandLogoUrl,
    initials,
    accent: space.brandAccent,
  })
}
