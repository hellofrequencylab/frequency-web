import { ImageResponse } from 'next/og'
import { getPillars } from '@/lib/pillars'
import { SITE_NAME } from '@/lib/site'

export const runtime = 'nodejs'
export const alt = `Practices by pillar on ${SITE_NAME}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Per-pillar dynamic OG image for /discover/practices/pillar/[slug].
// Falls back to a generic branded card when the pillar isn't found.
// Visual language mirrors app/discover/events/[slug]/opengraph-image.tsx:
// near-black gradient ground, indigo brand bar (#6366f1), white display type.

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const pillars = await getPillars().catch(() => [])
  const pillar = pillars.find((p) => p.slug === slug) ?? null

  const pillarName = pillar?.name ?? null
  const title = pillarName ? `${pillarName} Practices` : 'Practices'
  const isFallback = !pillar

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
        <div
          style={{
            display: 'flex',
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: '0.32em',
            color: 'rgba(255,255,255,0.85)',
          }}
        >
          {SITE_NAME.toUpperCase()}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              width: 84,
              height: 8,
              borderRadius: 9999,
              backgroundColor: '#6366f1',
              marginBottom: 28,
            }}
          />
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
            {title.length > 110 ? `${title.slice(0, 107)}…` : title}
          </div>
          {pillar?.description && (
            <div
              style={{
                display: 'flex',
                fontSize: 30,
                marginTop: 22,
                color: 'rgba(255,255,255,0.9)',
                maxWidth: 900,
              }}
            >
              {pillar.description.length > 120
                ? `${pillar.description.slice(0, 117)}…`
                : pillar.description}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', fontSize: 26, color: 'rgba(255,255,255,0.72)' }}>
          {isFallback ? `Practices on ${SITE_NAME}` : `${SITE_NAME} practice library`}
        </div>
      </div>
    ),
    size,
  )
}
