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
//
// A Network or Collective parent's feed is network-wide (ADR-1773): it carries its chapters' public
// events the way the Space's Network tab does (lib/collective/network-store.ts loadCollectiveNetworkWindow),
// so one subscription follows the whole Network. On a Network only approved chapter events ride along
// (SCAN-983); a chapter's own feed is unchanged. The same anon-safe RPC reads every source.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildVevent, icsEventInstants, icsLocalWallTimes, planCalendarFeed, renderCalendar } from '@/lib/events/ics'
import { resolveZone } from '@/lib/time/zone'
import { collectiveNetworkOpen, type NetworkParent } from '@/lib/collective/network'
import { listPublicCollectiveMembers } from '@/lib/collective/network-store'
import { approvedNetworkEventIds } from '@/lib/collective/network-tools-store'
import { networkFeedRows } from '@/lib/collective/network-tools'
import { isNetworkPlan } from '@/lib/collective/member-spaces'

export const dynamic = 'force-dynamic'

type SpaceRow = {
  id: string
  slug: string
  name: string | null
  visibility: string | null
  status: string | null
  plan: string | null
  network_connected: boolean | null
  owner_profile_id: string | null
}

// The feed RPC (space_public_calendar_feed) carries recurrence_type/recurrence_until/recurrence_rule/parent_event_id as
// of 20261203000000, so the route collapses a recurring series to ONE RRULE VEVENT instead of one VEVENT
// per materialized child (EC4).
type FeedRow = {
  id:               string
  title:            string
  description:      string | null
  location:         string | null
  starts_at:        string
  ends_at:          string | null
  slug:             string
  is_cancelled:     boolean
  time_zone:        string | null
  recurrence_type:  string | null
  recurrence_until: string | null
  /** The RRULE value (ADR-1299). The feed RPC projects it, and planCalendarFeed builds the VEVENT's
   *  RRULE from it — without this field a series that lands every other Wednesday would export as a
   *  plain weekly one and put twice as many gatherings in a subscriber's calendar as exist. */
  recurrence_rule:  string | null
  parent_event_id:  string | null
}

// Build one VEVENT for a feed row. `rrule`/`exdates` come from planCalendarFeed: a recurring anchor gets
// the cadence + the cancelled/missing occurrences subtracted; a one-off / orphan child gets neither.
// A recurring anchor exports in LOCAL time (DTSTART;TZID=zone + the stored wall-clock parts) so the
// client expands the series in the event's zone — DST never shifts the hour and the day-31 monthly
// clamp matches the DB (lib/events/ics.ts header). A one-off keeps the TRUE UTC instant.
function vevent(ev: FeedRow, appUrl: string, rrule: string | null, exdates: Date[]): string[] {
  const tzid = rrule ? resolveZone(ev.time_zone) : null
  const { start, end } = tzid
    ? icsLocalWallTimes(ev.starts_at, ev.ends_at)
    : icsEventInstants(ev.starts_at, ev.ends_at, ev.time_zone)
  return buildVevent({
    uid: ev.id,
    start,
    end,
    tzid,
    summary: ev.title,
    url: `${appUrl}/events/${ev.slug}`,
    location: ev.location,
    description: ev.description,
    rrule,
    exdates,
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
    .select('id, slug, name, visibility, status, plan, network_connected, owner_profile_id')
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

  // Network-wide: the chapters' rows, read with the same RPC in small batches (a large purchased
  // network must not open one request per chapter at once), deduped by id against the parent's own.
  const parent: NetworkParent = { id: space.id, slug: space.slug, status: (space.status ?? 'active') as NetworkParent['status'], plan: space.plan, networkConnected: space.network_connected === true, ownerProfileId: space.owner_profile_id }
  if (collectiveNetworkOpen(parent)) {
    const members = await listPublicCollectiveMembers(parent)
    const chapterRows: FeedRow[] = []
    for (let offset = 0; offset < members.length; offset += 4) {
      const batch = await Promise.all(members.slice(offset, offset + 4).map((m) => rpc.rpc('space_public_calendar_feed', { _space_id: m.id })))
      for (const result of batch) if (!result.error && Array.isArray(result.data)) chapterRows.push(...(result.data as FeedRow[]))
    }
    const network = isNetworkPlan(space.plan)
    const approved = network ? await approvedNetworkEventIds(space.id, [...new Set(chapterRows.flatMap((r) => [r.id, r.parent_event_id ?? r.id]))]) : new Set<string>()
    const seen = new Set(rows.map((r) => r.id))
    for (const row of networkFeedRows(chapterRows, { network, approved })) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      rows.push(row)
    }
    rows.sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.id.localeCompare(b.id))
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'
  const spaceName = space.name?.trim() || 'Frequency'

  // Group by series: a recurring anchor becomes one RRULE VEVENT (+ EXDATE for the missing/cancelled
  // occurrences), its in-feed children are folded in, and a child whose anchor is absent stays its own.
  const plans = planCalendarFeed(rows)
  const body = renderCalendar({
    name: `${spaceName}, Events`,
    description: `Upcoming events from ${spaceName}`,
    // One VTIMEZONE per distinct zone used by a recurring (TZID-form) VEVENT; renderCalendar dedupes.
    tzids: plans.filter((p) => p.rrule).map((p) => resolveZone(p.row.time_zone)),
    vevents: plans.map((p) => vevent(p.row, appUrl, p.rrule, p.exdates)),
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
