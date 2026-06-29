import { ImageResponse } from 'next/og'
import { getPublicCircleById } from '@/lib/discover'
import { SITE_NAME } from '@/lib/site'

export const runtime = 'nodejs'
export const alt = `A circle on ${SITE_NAME}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Per-circle dynamic OG image for /discover/circles/[id] (site-audit SEO-2). Falls back to a
// generic branded card when the circle isn't found. Visual language mirrors the practices /
// events cards: near-black gradient ground, indigo brand bar, white display type.
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const circle = await getPublicCircleById(id).catch(() => null)

  const title = circle?.name ?? 'Circles'
  const where = circle?.city ?? null
  const isFallback = !circle

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
          {where && (
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
              {where}
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
            {title.length > 110 ? `${title.slice(0, 107)}…` : title}
          </div>
        </div>

        <div style={{ display: 'flex', fontSize: 26, color: 'rgba(255,255,255,0.72)' }}>
          {isFallback ? `Circles on ${SITE_NAME}` : `A circle on ${SITE_NAME}`}
        </div>
      </div>
    ),
    size,
  )
}
