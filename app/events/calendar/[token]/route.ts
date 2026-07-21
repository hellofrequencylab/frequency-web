// Subscribable ICS calendar feed (Events B-4: discovery polish).
//
// Lives OUTSIDE the (main) auth-gated group so a calendar app (Google/Apple) can
// poll it with no session cookie — the [token] in the path IS the credential. A
// member subscribes once with the URL from the /events page and their upcoming
// "going" RSVPs stay in sync automatically; rotating the token kills old subs.
//
// Privacy: the token is the member's own secret, and the feed only ever contains
// events they personally RSVP'd to, so returning the real venue (LOCATION) is
// correct here — unlike the public /discover reads, this is a private feed. We
// resolve the token with the service-role admin client (RLS-exempt) exactly like
// the per-event app/events/[slug]/event.ics route, then read the small bounded
// event set through the event_calendar_feed RPC.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildVevent, icsEventInstants, renderCalendar } from '@/lib/events/ics'

export const dynamic = 'force-dynamic'

type FeedRow = {
  id:           string
  title:        string
  description:  string | null
  location:     string | null
  starts_at:    string
  ends_at:      string | null
  slug:         string
  is_cancelled: boolean
  // The event's IANA zone. starts_at/ends_at are wall-clock-as-UTC-parts; without this the feed
  // stamped them raw and every event landed 7-8h off (the per-event route already resolves through
  // it). The event_calendar_feed RPC returns it as of 20261193000000.
  time_zone:    string | null
}

// Build one VEVENT block for a feed row — resolving the TRUE UTC instant through the event's zone
// (icsEventInstants) so the client shows the correct absolute moment. The feed is the member's own
// private RSVP feed, so the venue (LOCATION) is included.
function vevent(ev: FeedRow, appUrl: string): string[] {
  const { start, end } = icsEventInstants(ev.starts_at, ev.ends_at, ev.time_zone)
  return buildVevent({
    uid: ev.id,
    start,
    end,
    summary: ev.title,
    url: `${appUrl}/events/${ev.slug}`,
    location: ev.location,
    description: ev.description,
    cancelled: ev.is_cancelled,
  })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  // A token is 64 hex chars (32 random bytes). Reject anything malformed before
  // touching the DB — keeps the surface tight and the error fast.
  if (!token || !/^[a-f0-9]{16,128}$/i.test(token)) {
    return new NextResponse('Not found', { status: 404 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('event_calendar_feed', { _token: token })

  // Unknown token → 404 (never reveal whether a token exists for some other state).
  if (error || !Array.isArray(data)) {
    return new NextResponse('Not found', { status: 404 })
  }

  const rows = data as FeedRow[]
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

  const body = renderCalendar({
    name: 'Frequency',
    description: 'Your upcoming Frequency events',
    vevents: rows.map((ev) => vevent(ev, appUrl)),
  })

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="frequency.ics"',
      // Calendar clients re-poll on their own cadence; allow a short shared cache.
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  })
}
