import { createAdminClient } from '@/lib/supabase/admin'
import { resolveEventHeroUrl } from '@/lib/events/hero-url'
import { readEventCoverFocus } from '@/lib/events/cover-focus'
import type { EventDetailsWithMedia } from '@/lib/events/details-media'
import { coverPlaceholderFor } from '@/lib/spaces/cover-placeholder'
import { claimCardResponse, CLAIM_OG_SIZE } from '@/lib/og/claim-card'
import { OG_CONTENT_TYPE } from '@/lib/og/content-type'
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
// reveals nothing.
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
    })
  }

  // Resolve the SAME hero the event page uses, through the one precedence (lib/events/hero-url.ts).
  const heroUrl = await resolveEventHeroUrl(ev)

  // The shared claim card fetches + inlines the hero. Any miss (no cover, slow / broken / oversized
  // fetch) falls through to the branded placeholder photo inside it, so a crawl never breaks.
  return claimCardResponse({
    name: (ev.title ?? '').trim() || 'Your event',
    pill: 'Event',
    noun: 'event',
    coverUrl: heroUrl,
    coverFocus: readEventCoverFocus(ev.theme),
    placeholderRelPath: coverPlaceholderFor(ev.id),
  })
}
