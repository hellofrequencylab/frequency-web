import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getSpaceBySlug, getSpaceVisibility } from '@/lib/spaces/store'
import { readHeroConfig, resolveHero } from '@/lib/spaces/hero-config'
import { defaultPrimaryCtaLabel } from '@/lib/spaces/profile-config'
import { coverPlaceholderFor } from '@/lib/spaces/cover-placeholder'
import { spaceTypeLabel } from '@/components/spaces/space-type'
import { fetchRemoteImage } from '@/lib/og/remote-image'
import { loadNunito } from '@/lib/og/load-nunito'
import { SITE_NAME } from '@/lib/site'

export const runtime = 'nodejs'
export const alt = `A space on ${SITE_NAME}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

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
// Satori has NO access to the CSS token system, so the DAWN tokens it needs are mirrored here as
// literals (app/globals.css :root): ink #141210 · on-ink #F3EEE3 · primary #E2912F ·
// broadcast (business accent) #1EB6C5 · signal (nonprofit accent) #0F8E78.
const INK = '#141210'
const ON_INK = '#F3EEE3'
const PRIMARY = '#E2912F'
const ACCENT_BY_TYPE: Record<string, string> = {
  business: '#1EB6C5',
  nonprofit: '#0F8E78',
}

/** Base64-inline a build-time asset under public/ (Satori needs bytes, not a relative URL). */
async function localImage(relPath: string): Promise<string> {
  const data = await readFile(join(process.cwd(), 'public', relPath))
  const mime = relPath.endsWith('.png') ? 'image/png' : 'image/jpeg'
  return `data:${mime};base64,${data.toString('base64')}`
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [space, visibility] = await Promise.all([getSpaceBySlug(slug), getSpaceVisibility(slug)])

  // Only a NETWORK (public), active Space reveals its brand on the card. Anything else falls back to
  // a neutral, identity-free card (no leak for a private space).
  const isPublic = !!space && space.status === 'active' && visibility !== 'private'

  if (!isPublic || !space) {
    // Neutral card: DAWN ink ground + the primary accent bar, no identity, no fonts to fetch (the
    // built-in font carries it, so it can never slow or fail a crawl of a private link).
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: 72,
            backgroundImage: `linear-gradient(180deg, ${INK} 0%, #211D17 100%)`,
            color: '#ffffff',
            fontFamily: 'sans-serif',
          }}
        >
          <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, letterSpacing: '0.32em', color: 'rgba(243,238,227,0.85)' }}>
            {SITE_NAME.toUpperCase()}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ width: 84, height: 8, borderRadius: 9999, backgroundColor: PRIMARY, marginBottom: 28 }} />
            <div style={{ display: 'flex', fontSize: 68, fontWeight: 800, lineHeight: 1.12, letterSpacing: '-0.02em', maxWidth: 1000 }}>
              A space on {SITE_NAME}
            </div>
          </div>
          <div style={{ display: 'flex', fontSize: 26, color: 'rgba(243,238,227,0.72)' }}>
            A community on {SITE_NAME}
          </div>
        </div>
      ),
      size,
    )
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
  const name = hero.heading.length > 70 ? `${hero.heading.slice(0, 67)}...` : hero.heading
  const tagline =
    hero.tagline && hero.tagline.length > 120 ? `${hero.tagline.slice(0, 117)}...` : hero.tagline
  const typeLabel = spaceTypeLabel(space.type)
  // The brand accent: the operator's own hex when set (brand_accent also admits token NAMES, which
  // Satori cannot resolve — only a literal hex passes), else the per-type default accent literal.
  const accent =
    space.brandAccent && /^#[0-9a-fA-F]{6}$/.test(space.brandAccent)
      ? space.brandAccent
      : (ACCENT_BY_TYPE[space.type] ?? PRIMARY)

  // Cover: the real upload (remote, fetched + inlined, fail-safe) or the page hero's own deterministic
  // placeholder. Logo: the real upload or an initials chip (the BrandAnchor fallback, accent-toned).
  const [remoteCover, logo, mark] = await Promise.all([
    space.coverImageUrl ? fetchRemoteImage(space.coverImageUrl) : Promise.resolve(null),
    space.brandLogoUrl ? fetchRemoteImage(space.brandLogoUrl) : Promise.resolve(null),
    localImage('images/Frequency-Logo-Round-Icon-white.png'),
  ])
  const cover = remoteCover ?? (await localImage(coverPlaceholderFor(space.id)))
  const initials = brandName
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  // Nunito subsets for exactly the glyphs on the card (loadNunito falls back to a bundled TTF, never
  // null, so the fonts array can never be empty and a crawl can never crash the render).
  const [black, bold] = await Promise.all([
    loadNunito(900, name),
    loadNunito(700, `${tagline ?? ''}${typeLabel}${initials}`),
  ])
  const fonts = [
    { name: 'Nunito', data: black, weight: 900 as const, style: 'normal' as const },
    { name: 'Nunito', data: bold, weight: 700 as const, style: 'normal' as const },
  ]

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', fontFamily: 'Nunito' }}>
        {/* Cover photo background — the page hero's own image. */}
        <img
          src={cover}
          alt=""
          width={size.width}
          height={size.height}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        {/* The ink legibility scrim (the page hero's shade treatment): bottom-heavy fade so the
            identity clears any photo while the top stays crisp. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(180deg, rgba(20,18,16,0.16) 0%, rgba(20,18,16,0.34) 44%, rgba(20,18,16,0.78) 76%, rgba(20,18,16,0.92) 100%)',
          }}
        />
        {/* The Frequency mark, top-right — quiet network attribution. */}
        <img
          src={mark}
          alt=""
          width={72}
          height={72}
          style={{ position: 'absolute', top: 48, right: 56, width: 72, height: 72, opacity: 0.95 }}
        />
        {/* Identity lockup anchored bottom-left over the scrim, mirroring the on-page hero: the logo
            chip beside the accent bar + type badge + name + tagline. */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'flex-end',
            width: '100%',
            height: '100%',
            padding: 64,
            gap: 32,
          }}
        >
          <div
            style={{
              display: 'flex',
              width: 148,
              height: 148,
              borderRadius: 28,
              backgroundColor: '#FFFFFF',
              boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            {logo ? (
              <img
                src={logo}
                alt=""
                width={148}
                height={148}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{ display: 'flex', fontWeight: 700, fontSize: 60, color: accent }}>{initials}</div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minWidth: 0 }}>
            <div style={{ width: 84, height: 8, borderRadius: 9999, backgroundColor: accent, marginBottom: 18 }} />
            <div
              style={{
                display: 'flex',
                alignSelf: 'flex-start',
                marginBottom: 14,
                padding: '6px 18px',
                borderRadius: 9999,
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: '0.05em',
                color: ON_INK,
                backgroundColor: 'rgba(255,255,255,0.16)',
                border: '1px solid rgba(255,255,255,0.35)',
              }}
            >
              {typeLabel}
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: name.length > 26 ? 56 : 72,
                fontWeight: 900,
                lineHeight: 1.05,
                letterSpacing: '-0.02em',
                color: '#FFFFFF',
                textShadow: '0 2px 24px rgba(0,0,0,0.55)',
                maxWidth: 880,
              }}
            >
              {name}
            </div>
            {tagline && (
              <div
                style={{
                  display: 'flex',
                  fontSize: 30,
                  fontWeight: 700,
                  lineHeight: 1.3,
                  marginTop: 12,
                  color: 'rgba(243,238,227,0.94)',
                  textShadow: '0 1px 12px rgba(0,0,0,0.6)',
                  maxWidth: 880,
                }}
              >
                {tagline}
              </div>
            )}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  )
}
