import { ImageResponse } from 'next/og'
import { getSpaceBySlug, getSpaceVisibility } from '@/lib/spaces/store'
import { spaceTypeLabel } from '@/components/spaces/space-type'
import { SITE_NAME } from '@/lib/site'

export const runtime = 'nodejs'
export const alt = `A space on ${SITE_NAME}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Per-Space dynamic OG image (SEO/AIO) — the share card for /spaces/<slug> and the `image` in the
// Space JSON-LD. Mirrors the events OG image: same brand styling, plain CSS (Satori), no remote font
// fetch (the built-in font carries it, so it can never slow or fail a crawl). PRIVACY: a PRIVATE
// Space (or a missing one) renders the neutral brand card with NO name or type, so a shared link to a
// noindex private profile never leaks its identity through the image. Brand name + type only — never
// member data.

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [space, visibility] = await Promise.all([getSpaceBySlug(slug), getSpaceVisibility(slug)])

  // Only a NETWORK (public), active Space reveals its brand on the card. Anything else falls back to
  // a neutral, identity-free card (no leak for a private space).
  const isPublic = !!space && space.status === 'active' && visibility !== 'private'
  const brandName = isPublic ? space.brandName?.trim() || space.name : null
  const typeLabel = isPublic ? spaceTypeLabel(space.type) : null
  const title = brandName ?? `A space on ${SITE_NAME}`

  // Visual language of the site OG image (app/opengraph-image.tsx): near-black ground, the indigo
  // brand bar (#6366f1 — Satori has no access to the CSS token system, so the literal mirrors the
  // root image), white display type.
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
          backgroundImage: 'linear-gradient(180deg, rgba(13,13,18,1) 0%, rgba(23,21,38,1) 100%)',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, letterSpacing: '0.32em', color: 'rgba(255,255,255,0.85)' }}>
          {SITE_NAME.toUpperCase()}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {typeLabel && (
            <div
              style={{
                display: 'flex',
                alignSelf: 'flex-start',
                marginBottom: 20,
                padding: '8px 18px',
                borderRadius: 9999,
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: '0.04em',
                color: '#c7d2fe',
                backgroundColor: 'rgba(99,102,241,0.22)',
              }}
            >
              {typeLabel}
            </div>
          )}
          <div style={{ width: 84, height: 8, borderRadius: 9999, backgroundColor: '#6366f1', marginBottom: 28 }} />
          <div
            style={{
              display: 'flex',
              fontSize: title.length > 60 ? 52 : 68,
              fontWeight: 800,
              lineHeight: 1.12,
              letterSpacing: '-0.02em',
              maxWidth: 1000,
            }}
          >
            {title.length > 110 ? `${title.slice(0, 107)}...` : title}
          </div>
        </div>

        <div style={{ display: 'flex', fontSize: 26, color: 'rgba(255,255,255,0.72)' }}>
          {isPublic ? `On the ${SITE_NAME} network` : 'A community on Frequency'}
        </div>
      </div>
    ),
    size,
  )
}
