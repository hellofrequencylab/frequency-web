// ICS export for events. Lives outside the (main) auth-gated group so
// the URL works for anyone with the link (e.g. shared in an email).
// Hidden / cancelled / past events still return the file — the user
// already has the link, downloading the .ics is harmless and matches
// Google Calendar's behaviour.

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
    .select('id, title, description, location, starts_at, ends_at, slug, is_cancelled')
    .eq('slug', slug)
    .maybeSingle()

  if (!rawEvent) {
    return new NextResponse('Event not found', { status: 404 })
  }
  const ev = rawEvent as unknown as EventRow

  const start = new Date(ev.starts_at)
  const end   = ev.ends_at
    ? new Date(ev.ends_at)
    : new Date(start.getTime() + 60 * 60 * 1000)  // default 1h

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://hellofrequency.com'
  const eventUrl = `${appUrl}/events/${ev.slug}`

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
    fold(`SUMMARY:${icsEscape(ev.title)}`),
    fold(`URL:${eventUrl}`),
  ]
  if (ev.location)    lines.push(fold(`LOCATION:${icsEscape(ev.location)}`))
  if (ev.description) lines.push(fold(`DESCRIPTION:${icsEscape(ev.description)}`))
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
