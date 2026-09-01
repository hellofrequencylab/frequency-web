import { createAdminClient } from '@/lib/supabase/admin'
import { resolveEventHeroUrl } from '@/lib/events/hero-url'
import { readEventCoverFocus } from '@/lib/events/cover-focus'
import type { EventDetailsWithMedia } from '@/lib/events/details-media'
import { coverPlaceholderFor } from '@/lib/spaces/cover-placeholder'
import { claimCardResponse, CLAIM_OG_SIZE } from '@/lib/og/claim-card'
import { cardResponse } from '@/lib/og/deliver'
import { OG_CONTENT_TYPE } from '@/lib/og/content-type'
import { fetchRemoteImage } from '@/lib/og/remote-image'
import { siteMarkDataUrl } from '@/lib/og/local-image'
import { loadNunito } from '@/lib/og/load-nunito'
import { SITE_NAME } from '@/lib/site'

export const runtime = 'nodejs'
export const alt = `Claim your event on ${SITE_NAME}`
export const size = CLAIM_OG_SIZE
// JPEG, not PNG. claimCardResponse re-encodes Satori's lossless output (lib/og/deliver.ts):
// this card is a photograph across the full canvas, which is 1,776KB as PNG and 151KB as JPEG.
// This literal must match the bytes deliverCard actually serves or og:image:type is a lie.
export const contentType = OG_CONTENT_TYPE

// The share card for a SEEDED EVENT claim link (/events/claim/<token>). A marketing pitch aimed at the
// real organizer: the event's OWN header/cover — the SAME image and SAME focal-point crop the public
// event page hero shows — plus the event title, an "Event" pill, the pitch line, and the Frequency
// watermark. Only a PUBLISHED, still-UNCLAIMED, un-removed event behind the token resolves; anything
// else (or a coverless event) falls back to the neutral shared claim card, so a guessed / used token
// reveals nothing. Events indigo accent (#6366f1) mirrors the per-event OG card.
//
// COVER PARITY — this must resolve the exact hero the event page renders (app/(main)/events/[slug]/page.tsx):
// uploaded PUBLIC cover → full scanned poster → the scanner's cropped cover. That precedence used to
// be spelled out here AND in the page AND in the per-event OG card, and the three drifted (the OG
// card never selected `cover_image_path` at all). It now lives in ONE place — lib/events/hero-url.ts,
// `resolveEventHeroUrl` — with `scripts/check-event-hero-parity.test.ts` failing a PR that re-rolls
// it by hand. Apply the SAME focal point (events.theme.coverFocus, via readEventCoverFocus) as the
// hero's objectPosition, so a shared card crops identically to the page. Satori can't load a bare
// remote src, so the chosen url's bytes are inlined via fetchRemoteImage; a freshly-signed url is
// valid at request time. Any miss (no cover, or a slow/broken/oversized fetch) yields the branded
// placeholder card.

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

// The Frequency mark is inlined through lib/og/local-image.ts (Satori needs bytes, not a relative
// URL). ⚠️ NOT a `readFile` in this file: its only call site passed a literal and it made no
// difference — @vercel/nft reads the emitted chunk, sees a `readFile` on a variable, and globs the
// whole of public/ into this function and the rest of the claim segment. See that module's header.

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

  // Resolve the SAME hero the event page uses, through the one precedence (lib/events/hero-url.ts).
  const heroUrl = await resolveEventHeroUrl(ev)

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
    loadNunito(900),
    loadNunito(700),
    siteMarkDataUrl(),
  ])
  const fonts = [
    { name: 'Nunito', data: black, weight: 900 as const, style: 'normal' as const },
    { name: 'Nunito', data: bold, weight: 700 as const, style: 'normal' as const },
  ]

  return cardResponse(
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
