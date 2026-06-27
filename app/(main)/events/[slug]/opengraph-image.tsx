import { ImageResponse } from 'next/og'
import { createAdminClient } from '@/lib/supabase/admin'
import { SITE_NAME } from '@/lib/site'

export const runtime = 'nodejs'
export const alt = `An event on ${SITE_NAME}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Per-event social share / SEO card for /events/<slug>. Every event gets one, whether or not a
// cover was uploaded — the card is brand-styled text (title · when · where · host), so it can never
// slow or fail a crawl on a missing image. Same visual language as the rest of the site's OG cards
// (app/opengraph-image.tsx, the spaces + discover cards): near-black ground, the indigo brand bar,
// white display type. Privacy: title, date, the typed location line, and the host display name only.

type Row = {
  title: string | null
  starts_at: string | null
  location: string | null
  attendance_mode: string | null
  is_cancelled: boolean | null
  host: { display_name: string | null } | null
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const admin = createAdminClient()
  const { data } = await admin
    .from('events')
    .select('title, starts_at, location, attendance_mode, is_cancelled, host:profiles!host_id ( display_name )')
    .eq('slug', slug)
    .maybeSingle()
  const ev = (data ?? null) as Row | null

  const title = ev?.title?.trim() || `An event on ${SITE_NAME}`
  const when = ev?.starts_at
    ? new Date(ev.starts_at).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null
  const where = ev?.location?.trim() || null
  const hostName = ev?.host?.display_name?.trim() || null
  const mode = ev?.attendance_mode ?? 'in_person'
  const chip = ev?.is_cancelled
    ? 'Cancelled'
    : mode === 'online'
      ? 'Online'
      : mode === 'hybrid'
        ? 'In person + online'
        : null

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
                color: ev?.is_cancelled ? '#fca5a5' : '#c7d2fe',
                backgroundColor: ev?.is_cancelled ? 'rgba(248,113,113,0.16)' : 'rgba(99,102,241,0.22)',
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
              maxWidth: 1040,
            }}
          >
            {title.length > 110 ? `${title.slice(0, 107)}…` : title}
          </div>
          <div style={{ display: 'flex', gap: 24, fontSize: 30, marginTop: 22, color: 'rgba(255,255,255,0.9)', flexWrap: 'wrap', maxWidth: 1040 }}>
            {when && <span>{when}</span>}
            {where && <span>· {where.length > 60 ? `${where.slice(0, 57)}…` : where}</span>}
          </div>
        </div>

        <div style={{ display: 'flex', fontSize: 26, color: 'rgba(255,255,255,0.72)' }}>
          {hostName ? `Hosted by ${hostName}` : 'A community gathering'}
        </div>
      </div>
    ),
    size,
  )
}
