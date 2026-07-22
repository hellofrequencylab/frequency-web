// The MASTER Frequency calendar feed (Events EC3, ADR-800). A single subscribable .ics over ALL
// public events across the network — the "everything happening near you" discovery calendar.
//
// Lives OUTSIDE the (main) auth-gated group so a calendar app (Google/Apple) can poll it with no
// session cookie — mirrors app/events/[slug]/event.ics, app/events/calendar/[token], and the
// per-space app/spaces/[slug]/calendar.ics. This path (app/events/calendar.ics) is a sibling of the
// token feed at app/events/calendar/[token]; the `.ics` suffix keeps them from colliding.
//
// No credential and no gate in the route: public_calendar_feed() takes no arguments and self-gates
// entirely in-function (published + PUBLIC-only — never unlisted/circle_only/private/draft — +
// non-cancelled + upcoming, and only network-visible active spaces). The route just renders whatever
// the RPC returns, so there is no way for this route to widen the feed beyond the model's contract.

import { NextResponse } from 'next/server'
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
  time_zone:    string | null
}

// Build one VEVENT for a master-feed row — resolving the TRUE UTC instant through the event's zone
// (icsEventInstants), the one timezone seam. These are PUBLIC events, so the venue is included exactly
// as the public event page + per-event .ics already expose it.
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

export async function GET() {
  const admin = createAdminClient()

  // public_calendar_feed is not in the generated RPC types yet (added by 20261196000000) — reach it
  // untyped (ADR-246). No arguments: the redaction contract lives entirely inside the function.
  const rpc = admin as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
  }
  const { data, error } = await rpc.rpc('public_calendar_feed', {})
  if (error || !Array.isArray(data)) {
    return new NextResponse('Not found', { status: 404 })
  }

  const rows = data as unknown as FeedRow[]
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

  const body = renderCalendar({
    name: 'Frequency events',
    description: 'Upcoming public events across Frequency',
    vevents: rows.map((ev) => vevent(ev, appUrl)),
  })

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="frequency-events.ics"',
      // Calendar clients re-poll on their own cadence; allow a short shared cache.
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  })
}
