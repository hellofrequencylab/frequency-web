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
}

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
    .replace(/;/g,  '\\;')
    .replace(/,/g,  '\\,')
    .replace(/\r?\n/g, '\\n')
}

// Fold long lines at 75 octets per RFC 5545 §3.1. We approximate with
// 75-char limit since our payload is ASCII/punctuation-heavy.
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const admin = createAdminClient()

  const { data: rawEvent } = await admin
    .from('events')
    .select('id, title, description, location, starts_at, ends_at, slug, is_cancelled, status, visibility')
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

  const start = new Date(ev.starts_at)
  const end   = ev.ends_at
    ? new Date(ev.ends_at)
    : new Date(start.getTime() + 60 * 60 * 1000)  // default 1h

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'
  const eventUrl = `${appUrl}/events/${ev.slug}`

  const summary = masked ? 'Private event' : ev.title

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Frequency//Community Events//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${ev.id}@frequency`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    fold(`SUMMARY:${icsEscape(summary)}`),
    fold(`URL:${eventUrl}`),
  ]
  // Venue + description are omitted entirely when masked (never leak them).
  if (!masked && ev.location)    lines.push(fold(`LOCATION:${icsEscape(ev.location)}`))
  if (!masked && ev.description) lines.push(fold(`DESCRIPTION:${icsEscape(ev.description)}`))
  if (ev.is_cancelled) lines.push('STATUS:CANCELLED')

  lines.push('END:VEVENT', 'END:VCALENDAR')

  const body = lines.join('\r\n') + '\r\n'

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type':        'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${ev.slug}.ics"`,
      'Cache-Control':       'no-store',
    },
  })
}
