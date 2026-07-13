import { createAdminClient } from '@/lib/supabase/admin'
import { posterSignedUrl } from '@/lib/events/poster-media'
import type { EventDetailsWithMedia } from '@/lib/events/details-media'
import { coverPlaceholderFor } from '@/lib/spaces/cover-placeholder'
import { claimCardResponse, CLAIM_OG_SIZE } from '@/lib/og/claim-card'
import { SITE_NAME } from '@/lib/site'

export const runtime = 'nodejs'
export const alt = `Claim your event on ${SITE_NAME}`
export const size = CLAIM_OG_SIZE
export const contentType = 'image/png'

// The share card for a SEEDED EVENT claim link (/events/claim/<token>). A marketing pitch aimed at the
// real organizer: the event's own poster + title, an "Event" pill, and the Frequency watermark. Only a
// PUBLISHED, still-UNCLAIMED, un-removed event behind the token resolves; anything else falls back to a
// neutral pitch card, so a guessed / used token reveals nothing. Events indigo accent (#6366f1) mirrors
// the per-event OG card.

type EventClaimRow = {
  id: string
  title: string | null
  host_id: string | null
  claimed_at: string | null
  removed_at: string | null
  poster_path: string | null
  details: EventDetailsWithMedia | null
}

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  let ev: EventClaimRow | null = null

  if (token && token.length >= 8) {
    const admin = createAdminClient()
    const { data } = await admin
      .from('events')
      .select('id, title, status, host_id, claimed_at, removed_at, poster_path, details')
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
      accent: '#6366f1',
    })
  }

  const cover = await posterSignedUrl(ev.details?.media?.coverPath ?? ev.poster_path)
  return claimCardResponse({
    name: ev.title ?? 'Your event',
    pill: 'Event',
    noun: 'event',
    coverUrl: cover,
    placeholderRelPath: coverPlaceholderFor(ev.id),
    accent: '#6366f1',
  })
}
