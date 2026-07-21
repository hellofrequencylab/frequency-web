// ICS export for events. Lives outside the (main) auth-gated group so
// the URL works for anyone with the link (e.g. shared in an email).
// Past events still return the full file — the user already has the link,
// downloading the .ics is harmless and matches Google Calendar's behaviour.
//
// SEC-9: this route is unauthenticated by design (no per-viewer membership
// check is possible here), so it must not leak more than the public event
// page would. For an event that the public page would NOT show in full —
// a draft (status != published), a private/circle_only event, OR a
// cancelled one — we mask the title and omit the venue/location and
// description, returning a generic placeholder + STATUS so an already-saved
// calendar entry still updates without exposing the real details.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildVevent, icsEventInstants, renderCalendar } from '@/lib/events/ics'

export const dynamic = 'force-dynamic'

type EventRow = {
  id:            string
  title:         string
  description:   string | null
  location:      string | null
  starts_at:     string
  ends_at:       string | null
  slug:          string
  is_cancelled:  boolean
  status:        string | null
  visibility:    string | null
  time_zone:     string | null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const admin = createAdminClient()

  const { data: rawEvent } = await admin
    .from('events')
    .select('id, title, description, location, starts_at, ends_at, slug, is_cancelled, status, visibility, time_zone')
    .eq('slug', slug)
    .maybeSingle()

  if (!rawEvent) {
    return new NextResponse('Event not found', { status: 404 })
  }
  const ev = rawEvent as unknown as EventRow

  // Mask details the public page wouldn't show in full: drafts, private /
  // circle_only events, and cancelled events. (circle_only needs a membership
  // check the page does per-viewer; this route is unauthenticated, so we treat
  // it as not-public and mask rather than confirm/leak the venue + title.)
  const isPublished = (ev.status ?? 'published') === 'published'
  const vis = ev.visibility ?? 'circle_only'
  const isPublicVisibility = vis === 'public' || vis === 'unlisted'
  const masked = !isPublished || !isPublicVisibility || ev.is_cancelled

  // starts_at/ends_at store the event's wall-clock as UTC PARTS. icsEventInstants resolves the TRUE
  // UTC instant through the event's own zone before stamping (the old code stamped the raw wall-clock
  // digits with a Z, so a 7pm-PT event landed 7h off). Emitting the true instant means each
  // subscriber's client shows the event at the correct absolute moment in their own local zone.
  const { start, end } = icsEventInstants(ev.starts_at, ev.ends_at, ev.time_zone)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

  const body = renderCalendar({
    vevents: [
      buildVevent({
        uid: ev.id,
        start,
        end,
        summary: masked ? 'Private event' : ev.title,
        url: `${appUrl}/events/${ev.slug}`,
        // Venue + description are omitted entirely when masked (never leak them).
        location: masked ? null : ev.location,
        description: masked ? null : ev.description,
        cancelled: ev.is_cancelled,
      }),
    ],
  })

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type':        'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${ev.slug}.ics"`,
      'Cache-Control':       'no-store',
    },
  })
}
