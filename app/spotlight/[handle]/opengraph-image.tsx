import { ImageResponse } from 'next/og'
import { getPublishedSpotlight } from '@/lib/spotlight/data'
import { SITE_NAME } from '@/lib/site'

export const runtime = 'nodejs'
export const alt = `A spotlight on ${SITE_NAME}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Per-spotlight dynamic OG card for /spotlight/[handle] (site-audit SEO-8): an indexable person
// page that was sharing only the raw avatar (or the generic site card). Falls back to a generic
// branded card when the spotlight isn't published. Mirrors the practices / circles OG language.
export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const data = await getPublishedSpotlight(handle).catch(() => null)

  const name = data?.profile.display_name || (data ? `@${data.profile.handle}` : 'Spotlight')
  const isFallback = !data

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
          <div style={{ width: 84, height: 8, borderRadius: 9999, backgroundColor: '#6366f1', marginBottom: 28 }} />
          <div
            style={{
              display: 'flex',
              fontSize: name.length > 60 ? 52 : 68,
              fontWeight: 800,
              lineHeight: 1.12,
              letterSpacing: '-0.02em',
              maxWidth: 1000,
            }}
          >
            {name.length > 110 ? `${name.slice(0, 107)}…` : name}
          </div>
        </div>

        <div style={{ display: 'flex', fontSize: 26, color: 'rgba(255,255,255,0.72)' }}>
          {isFallback ? `Spotlights on ${SITE_NAME}` : `A spotlight on ${SITE_NAME}`}
        </div>
      </div>
    ),
    size,
  )
}
