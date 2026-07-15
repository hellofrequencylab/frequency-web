import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// The claim landing an organizer reaches from the outreach message. It no longer
// renders its own card: it resolves the one-time token and sends the visitor to the
// REAL public event listing with a `?claim=` flag, where a prominent "Claim This
// Event" banner offers the ownership transfer. Kept PUBLIC (outside the (main) shell,
// like /join/[token]) so a signed-out organizer can resolve the link; the event page
// itself renders anon viewers in public chrome. 404 when the token is unknown, already
// used, or the event was removed, so a guessed token learns nothing.
export default async function ClaimEventPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token || token.length < 8) notFound()

  const admin = createAdminClient()
  const { data } = await admin
    .from('events')
    .select('slug, host_id, claimed_at, removed_at')
    .eq('claim_token', token)
    .eq('status', 'published')
    .maybeSingle()

  const ev = data as {
    slug: string | null
    host_id: string | null
    claimed_at: string | null
    removed_at: string | null
  } | null

  if (!ev || ev.removed_at || !ev.slug) notFound()

  // Already claimed: send the host who re-opens their used link straight to their event
  // (they asked why a second click 404s), and reveal nothing to anyone else.
  if (ev.host_id || ev.claimed_at) {
    const myProfileId = await getMyProfileId()
    if (myProfileId && ev.host_id === myProfileId) redirect(`/events/${ev.slug}`)
    notFound()
  }

  // Unclaimed → the real public listing, which carries the "Claim This Event" banner.
  redirect(`/events/${ev.slug}?claim=${token}`)
}
