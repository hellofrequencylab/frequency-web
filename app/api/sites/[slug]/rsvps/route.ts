// THE READER'S OWN RSVPS AT ONE SPACE, FOR ITS WEBSITE'S ACCOUNT PAGE (The Temple's "Your house"). Same shape and
// same gates as the membership route beside it (app/api/sites/[slug]/membership): a Space website is cached and
// anonymous, so its account page asks here, with the reader's own Frequency session, which upcoming gatherings
// THIS Space hosts the reader is going to.
//
//   GET /api/sites/<slug>/rsvps   →  { rsvps: { eventId, slug, title, startsAt, endsAt, status }[] }
//
// Answered only to the Space's own website hosts, the one Origin echoed back, credentials allowed; any other
// Origin gets no CORS grant. A signed-out call answers an empty list before any read, and a signed-in one only
// ever reads the caller's own rows (profile_id is the session's own id), narrowed to events this Space owns or
// hosts. Private, never cached. READ ONLY: an RSVP is made and changed on Frequency, never from a cached site.

import { NextResponse } from 'next/server'
import { getMyProfileId } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getSiteSpace } from '@/lib/sites/site-cache'
import { boundSiteDomain } from '@/lib/sites/site-domain'
import { siteSubdomainHost } from '@/lib/sites/host'
import { siteMemberOrigin } from '@/lib/sites/site-member'
import { upcomingEventFloor } from '@/lib/events/upcoming-floor'

export const dynamic = 'force-dynamic'

const CAP = 30

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const space = await getSiteSpace(slug)
  const base = { 'Cache-Control': 'private, no-store' }
  if (!space) return NextResponse.json({ rsvps: [] }, { status: 404, headers: base })
  const allowed = siteMemberOrigin(request.headers.get('origin'), [siteSubdomainHost(space.slug), await boundSiteDomain(space)])
  const headers: Record<string, string> = { ...base, Vary: 'Origin, Cookie' }
  if (allowed) {
    headers['Access-Control-Allow-Origin'] = allowed
    headers['Access-Control-Allow-Credentials'] = 'true'
  }
  const profileId = await getMyProfileId()
  if (!profileId) return NextResponse.json({ rsvps: [] }, { headers })

  const supabase = await createClient()
  const { data } = await supabase
    .from('event_rsvps')
    .select('status, event:events!inner(id, slug, title, starts_at, ends_at, is_cancelled, space_id, host_space_id)')
    .eq('profile_id', profileId)
    .eq('muted', false)
    .in('status', ['going', 'waitlist'])
    .gte('event.starts_at', upcomingEventFloor(new Date()))
    .limit(120)
  type Row = { status: string; event: { id: string; slug: string | null; title: string; starts_at: string; ends_at: string | null; is_cancelled: boolean | null; space_id: string | null; host_space_id: string | null } | null }
  const rsvps = ((data ?? []) as unknown as Row[])
    .filter((r) => r.event && !r.event.is_cancelled && (r.event.space_id === space.id || r.event.host_space_id === space.id))
    .sort((a, b) => (a.event!.starts_at < b.event!.starts_at ? -1 : 1))
    .slice(0, CAP)
    .map((r) => ({ eventId: r.event!.id, slug: r.event!.slug, title: r.event!.title, startsAt: r.event!.starts_at, endsAt: r.event!.ends_at, status: r.status }))
  return NextResponse.json({ rsvps }, { headers })
}
