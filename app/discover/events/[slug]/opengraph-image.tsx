import { ImageResponse } from 'next/og'
import { getPublicEventBySlug } from '@/lib/discover'
import { SITE_NAME } from '@/lib/site'

export const runtime = 'nodejs'
export const alt = `An event on ${SITE_NAME}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Per-event dynamic OG image (BUILD-LIST P3) — the share card for
// /discover/events/[slug] and the `image` in the Event JSON-LD. Same privacy
// rules as the page: title, date, city, hosting circle — never the venue.
// Brand-styled with plain CSS (Satori); no remote font fetch so this can never
// slow or fail a crawl — the built-in font carries it.

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const event = await getPublicEventBySlug(slug)

  const title = event?.title ?? `An event on ${SITE_NAME}`
  const when = event
    ? new Date(event.starts_at).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null
  const where = event?.city ?? null
  const circle = event?.circle_name ?? null

  // Visual language of the site OG image (app/opengraph-image.tsx): near-black
  // ground, the indigo brand bar (#6366f1 — Satori has no access to the CSS
  // token system, so the literal mirrors the root image), white display type.
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
              fontSize: title.length > 60 ? 52 : 68,
              fontWeight: 800,
              lineHeight: 1.12,
              letterSpacing: '-0.02em',
              maxWidth: 1000,
            }}
          >
            {title.length > 110 ? `${title.slice(0, 107)}…` : title}
          </div>
          <div style={{ display: 'flex', gap: 24, fontSize: 30, marginTop: 22, color: 'rgba(255,255,255,0.9)', flexWrap: 'wrap' }}>
            {when && <span>{when}</span>}
            {where && <span>· {where}</span>}
          </div>
        </div>

        <div style={{ display: 'flex', fontSize: 26, color: 'rgba(255,255,255,0.72)' }}>
          {circle ? `Hosted by ${circle}` : 'A community gathering'}
        </div>
      </div>
    ),
    size,
  )
}
