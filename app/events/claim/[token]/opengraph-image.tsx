import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createAdminClient } from '@/lib/supabase/admin'
import { posterSignedUrl } from '@/lib/events/poster-media'
import { readEventCoverFocus } from '@/lib/events/cover-focus'
import type { EventDetailsWithMedia } from '@/lib/events/details-media'
import { coverPlaceholderFor } from '@/lib/spaces/cover-placeholder'
import { claimCardResponse, CLAIM_OG_SIZE } from '@/lib/og/claim-card'
import { fetchRemoteImage } from '@/lib/og/remote-image'
import { loadNunito } from '@/lib/og/load-nunito'
import { SITE_NAME } from '@/lib/site'

export const runtime = 'nodejs'
export const alt = `Claim your event on ${SITE_NAME}`
export const size = CLAIM_OG_SIZE
export const contentType = 'image/png'

// The share card for a SEEDED EVENT claim link (/events/claim/<token>). A marketing pitch aimed at the
// real organizer: the event's OWN header/cover — the SAME image and SAME focal-point crop the public
// event page hero shows — plus the event title, an "Event" pill, the pitch line, and the Frequency
// watermark. Only a PUBLISHED, still-UNCLAIMED, un-removed event behind the token resolves; anything
// else (or a coverless event) falls back to the neutral shared claim card, so a guessed / used token
// reveals nothing. Events indigo accent (#6366f1) mirrors the per-event OG card.
//
// COVER PARITY — this must resolve the exact hero the event page renders (app/(main)/events/[slug]/page.tsx):
//   1. uploaded PUBLIC cover  (events.cover_image_path → event-media getPublicUrl)
//   2. else the full scanned poster  (events.poster_path, private → freshly SIGNED url)
//   3. else the scanner's cropped cover  (details.media.coverPath, private → SIGNED url)
// and apply the SAME focal point (events.theme.coverFocus, via readEventCoverFocus) as the hero's
// objectPosition, so a shared card crops identically to the page. Satori can't load a bare remote src,
// so the chosen url's bytes are inlined via fetchRemoteImage; a freshly-signed url is valid at request
// time. Any miss (no cover, or a slow/broken/oversized fetch) yields the branded placeholder card.

const ON_INK = '#F3EEE3'
const INDIGO = '#6366f1'

type EventClaimRow = {
  id: string
  title: string | null
  host_id: string | null
  claimed_at: string | null
  removed_at: string | null
  poster_path: string | null
  cover_image_path: string | null
  details: EventDetailsWithMedia | null
  theme: unknown
}

/** Base64-inline a build-time asset under public/ (Satori needs bytes, not a relative URL). */
async function localImage(relPath: string): Promise<string> {
  const clean = relPath.replace(/^\//, '')
  const data = await readFile(join(process.cwd(), 'public', clean))
  const mime = clean.endsWith('.png') ? 'image/png' : 'image/jpeg'
  return `data:${mime};base64,${data.toString('base64')}`
}

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  let ev: EventClaimRow | null = null

  if (token && token.length >= 8) {
    const admin = createAdminClient()
    const { data } = await admin
      .from('events')
      .select(
        'id, title, status, host_id, claimed_at, removed_at, poster_path, cover_image_path, details, theme',
      )
      .eq('claim_token', token)
      .eq('status', 'published')
      .maybeSingle()
    ev = (data ?? null) as unknown as EventClaimRow | null
  }

  // Unresolvable / already-claimed / removed: neutral pitch card, no identity leak.
  if (!ev || ev.host_id || ev.claimed_at || ev.removed_at) {
    return claimCardResponse({
      name: 'Your event',
      pill: 'Event',
      noun: 'event',
      placeholderRelPath: '/images/site/community-dinner.jpg',
      accent: INDIGO,
    })
  }

  // Resolve the SAME hero the event page uses: uploaded public cover → full scanned poster →
  // scanner's cropped cover (page.tsx `heroUrl = coverUrl ?? posterFullUrl ?? coverCropUrl`).
  const admin = createAdminClient()
  const publicCover = ev.cover_image_path
    ? admin.storage.from('event-media').getPublicUrl(ev.cover_image_path).data.publicUrl
    : null
  const posterFullUrl = ev.poster_path ? await posterSignedUrl(ev.poster_path) : null
  const coverCropUrl =
    !publicCover && !posterFullUrl && ev.details?.media?.coverPath
      ? await posterSignedUrl(ev.details.media.coverPath)
      : null
  const heroUrl = publicCover ?? posterFullUrl ?? coverCropUrl

  // Inline the chosen image for Satori. Any miss (no cover, slow / broken / oversized fetch) falls
  // through to the branded placeholder card below.
  const cover = heroUrl ? await fetchRemoteImage(heroUrl) : null
  if (!cover) {
    return claimCardResponse({
      name: ev.title ?? 'Your event',
      pill: 'Event',
      noun: 'event',
      placeholderRelPath: coverPlaceholderFor(ev.id),
      accent: INDIGO,
    })
  }

  // The SAME focal point the event page applies to its hero <Image> (events.theme.coverFocus),
  // as a CSS object-position — so the shared card crops identically to the page.
  const coverFocus = readEventCoverFocus(ev.theme)

  const name = (ev.title ?? '').trim() || 'Your event'
  const displayName = name.length > 44 ? `${name.slice(0, 41)}...` : name
  const pitch = `Claim your event on ${SITE_NAME}`
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const [black, bold, mark] = await Promise.all([
    loadNunito(900, displayName),
    loadNunito(700, `${pitch}Event${initials}`),
    localImage('images/Frequency-Logo-Round-Icon-white.png'),
  ])
  const fonts = [
    { name: 'Nunito', data: black, weight: 900 as const, style: 'normal' as const },
    { name: 'Nunito', data: bold, weight: 700 as const, style: 'normal' as const },
  ]

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', fontFamily: 'Nunito' }}>
        {/* The event's own header/cover, cropped to the SAME focal point as the page hero. */}
        <img
          src={cover}
          alt=""
          width={CLAIM_OG_SIZE.width}
          height={CLAIM_OG_SIZE.height}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: coverFocus,
          }}
        />
        {/* Legibility scrim: a touch at the top so the pill + watermark read, heavy at the bottom for
            the lockup. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(180deg, rgba(20,18,16,0.55) 0%, rgba(20,18,16,0.20) 30%, rgba(20,18,16,0.50) 66%, rgba(20,18,16,0.90) 100%)',
          }}
        />

        {/* Top-left: the entity DESIGNATOR pill. */}
        <div
          style={{
            position: 'absolute',
            top: 48,
            left: 56,
            display: 'flex',
            padding: '10px 22px',
            borderRadius: 9999,
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: '0.04em',
            color: ON_INK,
            backgroundColor: 'rgba(255,255,255,0.18)',
            border: '1px solid rgba(255,255,255,0.40)',
          }}
        >
          Event
        </div>

        {/* Top-right: the Frequency watermark. */}
        <img
          src={mark}
          alt=""
          width={76}
          height={76}
          style={{ position: 'absolute', top: 44, right: 56, width: 76, height: 76, opacity: 0.96 }}
        />

        {/* Bottom-left lockup: logo chip + accent bar + event name + the pitch line. */}
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
              width: 140,
              height: 140,
              borderRadius: 26,
              backgroundColor: '#FFFFFF',
              boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', fontWeight: 700, fontSize: 58, color: INDIGO }}>{initials}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minWidth: 0 }}>
            <div style={{ width: 84, height: 8, borderRadius: 9999, backgroundColor: INDIGO, marginBottom: 18 }} />
            <div
              style={{
                display: 'flex',
                fontSize: displayName.length > 24 ? 58 : 72,
                fontWeight: 900,
                lineHeight: 1.04,
                letterSpacing: '-0.02em',
                color: '#FFFFFF',
                textShadow: '0 2px 24px rgba(0,0,0,0.55)',
                maxWidth: 900,
              }}
            >
              {displayName}
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 34,
                fontWeight: 700,
                lineHeight: 1.25,
                marginTop: 14,
                color: ON_INK,
                textShadow: '0 1px 12px rgba(0,0,0,0.6)',
                maxWidth: 900,
              }}
            >
              {pitch}
            </div>
          </div>
        </div>

        {/* A thin brand keyline along the bottom edge in the accent, tying the card to the network. */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 10, backgroundColor: INDIGO }} />
      </div>
    ),
    { ...CLAIM_OG_SIZE, fonts },
  )
}
