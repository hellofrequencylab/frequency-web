import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createAdminClient } from '@/lib/supabase/admin'
import { posterSignedUrl } from '@/lib/events/poster-media'
import type { EventDetailsWithMedia } from '@/lib/events/details-media'
import { fetchRemoteImage } from '@/lib/og/remote-image'
import { loadNunito } from '@/lib/og/load-nunito'
import { SITE_NAME } from '@/lib/site'

export const runtime = 'nodejs'
export const alt = `An event on ${SITE_NAME}`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Per-event social share / SEO card for /events/<slug>. When the event has a poster/cover (an uploaded
// cover or a scanned poster crop), the card leads with THAT image as the background, with the identity
// lockup (title · when · where · host) over a legibility scrim and the Frequency watermark top-right —
// the SAME visual language as the Space OG card (spaces/[slug]/opengraph-image.tsx). When there is no
// poster (or the image fails to fetch), it falls back to the brand-styled TEXT card, so a crawl can
// never slow or crash on a missing/broken image. Privacy: title, date, the typed location line, and
// the host display name only. The cancelled / online / hybrid chip rides both variants.
//
// Satori has NO access to the CSS token system, so the few colors it needs are literals mirroring the
// existing event cards (this file's prior text card + the claim card): events indigo #6366f1 accent,
// near-black ground, white display type.
const INDIGO = '#6366f1'

type Row = {
  title: string | null
  starts_at: string | null
  location: string | null
  attendance_mode: string | null
  is_cancelled: boolean | null
  poster_path: string | null
  details: EventDetailsWithMedia | null
  host: { display_name: string | null } | null
}

/** Base64-inline a build-time asset under public/ (Satori needs bytes, not a relative URL). */
async function localImage(relPath: string): Promise<string> {
  const data = await readFile(join(process.cwd(), 'public', relPath))
  const mime = relPath.endsWith('.png') ? 'image/png' : 'image/jpeg'
  return `data:${mime};base64,${data.toString('base64')}`
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const admin = createAdminClient()
  const { data } = await admin
    .from('events')
    .select(
      'title, starts_at, location, attendance_mode, is_cancelled, poster_path, details, host:profiles!host_id ( display_name )',
    )
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
  const chipEl = chip ? (
    <div
      style={{
        display: 'flex',
        alignSelf: 'flex-start',
        marginBottom: 18,
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
  ) : null

  // The event's own poster/cover (a cropped cover, else the full flyer), fetched + inlined for Satori.
  // Any miss (no path, no signed URL, a non-image / oversized / slow fetch) yields null → the text card.
  const coverSigned = await posterSignedUrl(ev?.details?.media?.coverPath ?? ev?.poster_path)
  const cover = coverSigned ? await fetchRemoteImage(coverSigned) : null

  // ── FALLBACK: the brand-styled text card (no poster, or the image failed to load). Built-in font,
  // so it can never slow or fail a crawl. Matches the prior card. ────────────────────────────────────
  if (!cover) {
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
            {chipEl}
            <div style={{ width: 84, height: 8, borderRadius: 9999, backgroundColor: INDIGO, marginBottom: 28 }} />
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

  // ── The rich poster card: the event's cover as the background, identity lockup over the ink scrim,
  // Frequency mark top-right — mirroring the Space OG card. ───────────────────────────────────────────
  const displayTitle = title.length > 90 ? `${title.slice(0, 87)}…` : title
  const displayWhere = where && where.length > 56 ? `${where.slice(0, 53)}…` : where
  const metaLine = [when, displayWhere].filter(Boolean).join('  ·  ')

  // Nunito subsets for exactly the glyphs on the card (loadNunito falls back to a bundled TTF, never
  // null, so the fonts array can never be empty and a crawl can never crash the render).
  const [black, bold, mark] = await Promise.all([
    loadNunito(900, displayTitle),
    loadNunito(700, `${metaLine}${hostName ?? ''}${chip ?? ''}${SITE_NAME}`),
    localImage('images/Frequency-Logo-Round-Icon-white.png'),
  ])
  const fonts = [
    { name: 'Nunito', data: black, weight: 900 as const, style: 'normal' as const },
    { name: 'Nunito', data: bold, weight: 700 as const, style: 'normal' as const },
  ]

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', fontFamily: 'Nunito' }}>
        {/* Poster/cover background — the event's own image. */}
        <img
          src={cover}
          alt=""
          width={size.width}
          height={size.height}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        {/* Ink legibility scrim: bottom-heavy fade so the identity clears any photo while the top
            stays crisp (the same treatment as the Space card). */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(180deg, rgba(13,13,18,0.16) 0%, rgba(13,13,18,0.34) 44%, rgba(13,13,18,0.80) 76%, rgba(13,13,18,0.94) 100%)',
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
        {/* Identity lockup anchored bottom-left over the scrim: chip · accent bar · title · when/where · host. */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            width: '100%',
            height: '100%',
            padding: 64,
          }}
        >
          {chipEl}
          <div style={{ width: 84, height: 8, borderRadius: 9999, backgroundColor: INDIGO, marginBottom: 20 }} />
          <div
            style={{
              display: 'flex',
              fontSize: displayTitle.length > 42 ? 56 : 72,
              fontWeight: 900,
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              color: '#FFFFFF',
              textShadow: '0 2px 24px rgba(0,0,0,0.55)',
              maxWidth: 1000,
            }}
          >
            {displayTitle}
          </div>
          {metaLine && (
            <div
              style={{
                display: 'flex',
                fontSize: 30,
                fontWeight: 700,
                marginTop: 16,
                color: 'rgba(243,243,255,0.94)',
                textShadow: '0 1px 12px rgba(0,0,0,0.6)',
                maxWidth: 1000,
              }}
            >
              {metaLine}
            </div>
          )}
          {hostName && (
            <div
              style={{
                display: 'flex',
                fontSize: 26,
                fontWeight: 700,
                marginTop: 12,
                color: 'rgba(243,243,255,0.78)',
                textShadow: '0 1px 12px rgba(0,0,0,0.6)',
              }}
            >
              Hosted by {hostName}
            </div>
          )}
        </div>
      </div>
    ),
    { ...size, fonts },
  )
}
