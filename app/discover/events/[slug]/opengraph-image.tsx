import { ImageResponse } from 'next/og'
import { getPublicEventBySlug } from '@/lib/discover'
import { getEventEnrichment } from '../_data'
import { SITE_NAME } from '@/lib/site'

export const runtime = 'nodejs'
export const alt = `An event on ${SITE_NAME}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Per-event dynamic OG image (BUILD-LIST P3) — the share card for
// /discover/events/[slug] and the `image` in the Event JSON-LD. Same privacy
// rules as the page: title, date, city, hosting circle — never the venue or the
// members-only join link. Brand-styled with plain CSS (Satori); no remote font
// fetch so this can never slow or fail a crawl — the built-in font carries it.

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [event, enrichment] = await Promise.all([
    getPublicEventBySlug(slug),
    getEventEnrichment(slug),
  ])

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
  const mode = enrichment?.attendance_mode ?? 'in_person'
  // A small chip: cancelled wins, then the online/hybrid format flag. In-person
  // events show no chip (it's the unremarkable default).
  const chip = enrichment?.is_cancelled
    ? 'Cancelled'
    : mode === 'online'
      ? 'Online'
      : mode === 'hybrid'
        ? 'In person + online'
        : null

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
          {chip && (
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
                // Cancelled reads in a muted warning tone; format flags ride the
                // indigo brand surface. Literals mirror the root OG image (Satori
                // has no access to the CSS token system).
                color: enrichment?.is_cancelled ? '#fca5a5' : '#c7d2fe',
                backgroundColor: enrichment?.is_cancelled
                  ? 'rgba(248,113,113,0.16)'
                  : 'rgba(99,102,241,0.22)',
              }}
            >
              {chip}
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
