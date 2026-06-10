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
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

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
}

// ── ICS helpers (RFC 5545) — same shapes as app/events/[slug]/event.ics ──────

// Format a JS Date as ICS UTC stamp: YYYYMMDDTHHMMSSZ
function icsStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  )
}

// Escape per RFC 5545: backslash, semicolon, comma, newline.
function icsEscape(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

// Fold long lines at 75 octets per RFC 5545 §3.1.
function fold(line: string): string {
  if (line.length <= 75) return line
  const chunks: string[] = []
  let i = 0
  while (i < line.length) {
    chunks.push(line.slice(i, i + 75))
    i += 75
  }
  return chunks.join('\r\n ')
}

// Build one VEVENT block for an event row.
function vevent(ev: FeedRow, appUrl: string): string[] {
  const start = new Date(ev.starts_at)
  const end = ev.ends_at
    ? new Date(ev.ends_at)
    : new Date(start.getTime() + 60 * 60 * 1000) // default 1h
  const eventUrl = `${appUrl}/events/${ev.slug}`

  const lines: string[] = [
    'BEGIN:VEVENT',
    `UID:${ev.id}@frequency`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    fold(`SUMMARY:${icsEscape(ev.title)}`),
    fold(`URL:${eventUrl}`),
  ]
  if (ev.location) lines.push(fold(`LOCATION:${icsEscape(ev.location)}`))
  if (ev.description) lines.push(fold(`DESCRIPTION:${icsEscape(ev.description)}`))
  if (ev.is_cancelled) lines.push('STATUS:CANCELLED')
  lines.push('END:VEVENT')
  return lines
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

  const admin = createAdminClient() as unknown as SupabaseClient
  const { data, error } = await admin.rpc('event_calendar_feed', { _token: token })

  // Unknown token → 404 (never reveal whether a token exists for some other state).
  if (error || !Array.isArray(data)) {
    return new NextResponse('Not found', { status: 404 })
  }

  const rows = data as FeedRow[]
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Frequency//Community Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold('X-WR-CALNAME:Frequency'),
    fold('X-WR-CALDESC:Your upcoming Frequency events'),
  ]
  for (const ev of rows) lines.push(...vevent(ev, appUrl))
  lines.push('END:VCALENDAR')

  const body = lines.join('\r\n') + '\r\n'

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
