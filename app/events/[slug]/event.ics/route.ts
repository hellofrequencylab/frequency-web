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
import { buildVevent, computeFeedExdates, icsEventInstants, icsLocalWallTimes, renderCalendar, rruleForRecurrence } from '@/lib/events/ics'
import { eventInstant, resolveZone } from '@/lib/time/zone'

export const dynamic = 'force-dynamic'

type EventRow = {
  id:                string
  title:             string
  description:       string | null
  location:          string | null
  starts_at:         string
  ends_at:           string | null
  slug:              string
  is_cancelled:      boolean
  status:            string | null
  visibility:        string | null
  time_zone:         string | null
  recurrence_type:   string | null
  recurrence_until:  string | null
  parent_event_id:   string | null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const admin = createAdminClient()

  const { data: rawEvent } = await admin
    .from('events')
    .select('id, title, description, location, starts_at, ends_at, slug, is_cancelled, status, visibility, time_zone, recurrence_type, recurrence_until, parent_event_id')
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

  // A recurring ANCHOR (recurrence_type != none, no parent) exports as ONE VEVENT carrying an RRULE, so
  // "add to calendar" adds the whole series instead of a single date. A materialized CHILD occurrence
  // (parent_event_id set) stays a single dated VEVENT. Never emit the cadence for a masked event (a
  // private/draft/cancelled event leaks nothing extra, matching the title/venue masking above). The
  // anchor's stored day-of-month drives the monthly short-month idiom (a day-31 series must not skip
  // February); UNTIL stays the TRUE UTC instant, as RFC 5545 requires whenever DTSTART is zoned.
  const isRecurringAnchor = ev.parent_event_id == null && (ev.recurrence_type ?? 'none') !== 'none'
  const untilInstant = ev.recurrence_until ? eventInstant(ev.recurrence_until, ev.time_zone) : null
  const rrule = !masked && isRecurringAnchor
    ? rruleForRecurrence(ev.recurrence_type, untilInstant, new Date(ev.starts_at).getUTCDate())
    : null

  // starts_at/ends_at store the event's wall-clock as UTC PARTS. A recurring series (rrule set)
  // exports in LOCAL time — DTSTART;TZID=zone + those stored parts + a VTIMEZONE — so the client
  // expands the RRULE in the event's zone and DST never shifts the hour (a bare UTC DTSTART expands
  // at one fixed offset and rendered every post-transition occurrence an hour off). A one-off or
  // masked VEVENT keeps the TRUE UTC instant via icsEventInstants (the old code stamped the raw
  // wall-clock digits with a Z, so a 7pm-PT event landed 7h off); a single instant has no expansion
  // to drift.
  const tzid = rrule ? resolveZone(ev.time_zone) : null
  const { start, end } = tzid
    ? icsLocalWallTimes(ev.starts_at, ev.ends_at)
    : icsEventInstants(ev.starts_at, ev.ends_at, ev.time_zone)

  // EXDATE parity with the subscribable feeds (planCalendarFeed): subtract the anchor's cancelled/
  // deleted occurrences so "add to calendar" from the event page never resurrects a date the member
  // removed. Without this the per-event export re-generates every occurrence from the bare RRULE.
  let exdates: Date[] = []
  if (rrule) {
    const { data: childRows } = await admin
      .from('events')
      .select('starts_at')
      .eq('parent_event_id', ev.id)
      .eq('is_cancelled', false)
    const present = [
      ev.starts_at,
      ...(((childRows as { starts_at: string }[] | null) ?? []).map((c) => c.starts_at)),
    ]
    exdates = computeFeedExdates(
      {
        starts_at: ev.starts_at,
        recurrence_type: ev.recurrence_type,
        recurrence_until: ev.recurrence_until,
      },
      present,
    )
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

  const body = renderCalendar({
    // The TZID-form recurring VEVENT needs its zone's VTIMEZONE in the same calendar (RFC 5545).
    tzids: tzid ? [tzid] : [],
    vevents: [
      buildVevent({
        uid: ev.id,
        start,
        end,
        tzid,
        summary: masked ? 'Private event' : ev.title,
        url: `${appUrl}/events/${ev.slug}`,
        // Venue + description are omitted entirely when masked (never leak them).
        location: masked ? null : ev.location,
        description: masked ? null : ev.description,
        rrule,
        exdates,
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
