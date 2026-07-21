// Public subscribable ICS feed for a Space's events (Events EC1, ADR-800).
//
// Lives OUTSIDE the (main) auth-gated group so a calendar app (Google/Apple) can poll it with no
// session cookie — mirrors app/events/[slug]/event.ics and app/events/calendar/[token]. A guest adds
// `webcal://<host>/spaces/<slug>/calendar.ics` once and the space's upcoming public events stay in
// sync. The slug is the only credential and it exposes ONLY what the public space page already shows:
// published, public/unlisted, non-cancelled events (space_public_calendar_feed enforces this).
//
// Gating: we resolve the slug to the space and refuse a private/suspended space (no public feed for a
// walled-off space) BEFORE reading its events, then hand the space_id to the feed RPC.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildVevent, icsEventInstants, renderCalendar } from '@/lib/events/ics'

export const dynamic = 'force-dynamic'

type SpaceRow = {
  id: string
  name: string | null
  visibility: string | null
  status: string | null
}

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
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  if (!slug || slug.length > 128) {
    return new NextResponse('Not found', { status: 404 })
  }

  const admin = createAdminClient()

  // Resolve the space and gate: only a network-visible, active space has a public feed. A private or
  // suspended/archived space returns 404 (never confirm it exists). This is DEFENSE IN DEPTH + the 404
  // + the calendar title — the authoritative gate is co-located in space_public_calendar_feed itself
  // (it joins spaces on visibility='network' + status='active'), since that RPC is anon-callable
  // directly via PostgREST and must not depend on this route to stay safe.
  const { data: spaceRaw } = await admin
    .from('spaces')
    .select('id, name, visibility, status')
    .eq('slug', slug)
    .maybeSingle()
  const space = spaceRaw as unknown as SpaceRow | null
  if (!space || space.visibility !== 'network' || (space.status ?? 'active') !== 'active') {
    return new NextResponse('Not found', { status: 404 })
  }

  // space_public_calendar_feed is not in the generated RPC types yet (added by 20261193000000) — reach
  // it untyped (ADR-246), scoped to the resolved space id.
  const rpc = admin as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
  }
  const { data, error } = await rpc.rpc('space_public_calendar_feed', { _space_id: space.id })
  if (error || !Array.isArray(data)) {
    return new NextResponse('Not found', { status: 404 })
  }

  const rows = data as unknown as FeedRow[]
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'
  const spaceName = space.name?.trim() || 'Frequency'

  const body = renderCalendar({
    name: `${spaceName}, Events`,
    description: `Upcoming events from ${spaceName}`,
    vevents: rows.map((ev) => vevent(ev, appUrl)),
  })

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${slug}.ics"`,
      // Calendar clients re-poll on their own cadence; allow a short shared cache.
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  })
}
