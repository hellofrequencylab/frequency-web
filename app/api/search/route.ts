import { DIRECTORY_VISIBILITY_COLUMNS, isListableInDirectory } from '@/lib/connections/directory-visibility'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { connectionsOwnerId } from '@/lib/connections/access'
import { searchVisibleLeads } from '@/lib/crm/people-search'
import { rateLimitOk, clientIp, tooMany } from '@/lib/rate-limit'
import { getViewerHats } from '@/lib/core/viewer-hats'
import { accessTo } from '@/lib/core/access-matrix'
import { matchDestinations } from '@/lib/search/destinations'
import { HOME_TZ, dayInZone } from '@/lib/time/zone'
import {
  SERIES_COLUMNS,
  TEASER_CARDS_PER_SERIES,
  collapseSeriesAroundFloor,
  seriesFetchLimit,
  seriesUpcomingFloor,
  type SeriesRow,
} from '@/lib/events/series'

// Live search for the in-app search overlay (components/search/search-overlay.tsx).
// Returns a small slice of people / posts / events / leads for a query as JSON, so
// the overlay can show results as you type. The full /search page is the "see all"
// destination. Mirrors the queries on that page; auth-gated (in-app search).
//
// `leads` are non-member people the viewer is ENTITLED to find — their own captures,
// plus (since they're a steward) network-shared captures from stewards in their own
// locality — gated by lib/crm/visibility. Only stewards/staff have or can see these,
// so we resolve the viewer through connectionsOwnerId() and skip the query otherwise.

const EMPTY = { people: [], posts: [], events: [], leads: [], pages: [] }

/** Event rows the overlay shows, counting REPEATING EVENTS rather than dates. */
const EVENT_RESULTS = 6

type OverlayEventRow = SeriesRow & {
  title: string
  location: string | null
  is_cancelled: boolean
  is_demo: boolean
}

export async function GET(request: Request) {
  if (!(await rateLimitOk('search', clientIp(request), 60, '60 s'))) return tooMany()

  const { searchParams } = new URL(request.url)
  // Strip characters that would break a PostgREST or() filter; trim + cap length.
  const q = (searchParams.get('q') ?? '').replace(/[(),]/g, ' ').trim().slice(0, 80)
  if (q.length < 2) return NextResponse.json(EMPTY)
  // Escape LIKE wildcards so user input is always treated as a literal substring.
  const safeQ = q.replace(/[%_\\]/g, '\\$&')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json(EMPTY, { status: 401 })

  // Stewards (host+) / staff can also see leads — their own captures and network shares.
  const stewardId = await connectionsOwnerId()

  // Navigable destinations matching the query, gated by the access matrix so a member
  // never sees admin tools (and a visitor never sees member-only pages). Resolved from
  // the live viewer's hats — the same projection the shell uses.
  const hats = await getViewerHats()
  const pages = matchDestinations(q)
    .filter((d) => !d.surface || accessTo(d.surface, hats) !== 'none')
    .slice(0, 6)
    .map((d) => ({ href: d.href, label: d.label, group: d.group }))

  const admin = createAdminClient()

  // Events read TWICE, around the wall-clock floor (ADR-897). This read had no date predicate and
  // ordered ascending, so its window was the OLDEST six matching rows from the beginning of time —
  // folding that single window would elect a series' very first date ever. A FACTORY, not one
  // shared builder: PostgrestFilterBuilder mutates and returns `this` and .order() concatenates, so
  // a shared instance would fire one query carrying both predicates and match nothing.
  const eventFloor = seriesUpcomingFloor(dayInZone(new Date(), HOME_TZ))
  const eventFetchLimit = seriesFetchLimit(EVENT_RESULTS)
  const eventsBase = () =>
    admin
      .from('events')
      .select(`id, title, slug, starts_at, location, is_cancelled, is_demo, ${SERIES_COLUMNS}`)
      .or(`title.ilike.%${safeQ}%,description.ilike.%${safeQ}%`)
      .eq('status', 'published')
      .eq('visibility', 'public')
      .eq('is_cancelled', false)

  const [peopleRes, postsRes, eventsUpcomingRes, eventsPastRes, leads] = await Promise.all([
    admin
      .from('profiles')
      // 🔴 Same service-role shape as /search and /network: `is_active` was the only filter, so a
      // member who opted out of the directory or turned Ghost mode on was still findable here by
      // name. The four privacy columns ride the select and each row goes through the shared
      // predicate (lib/connections/directory-visibility.ts, ADR-TBD) BEFORE the palette's six-row
      // trim, so a hidden row can never be one of the six. Fetch a wider page for the same reason.
      .select(`id, display_name, handle, avatar_url, community_role, is_demo, ${DIRECTORY_VISIBILITY_COLUMNS}`)
      .or(`display_name.ilike.%${safeQ}%,handle.ilike.%${safeQ}%`)
      .eq('is_active', true)
      .order('display_name')
      .limit(18),
    // The admin client bypasses RLS, so search must scope results itself: only
    // PUBLIC posts (visibility enum is public|region|cluster|group — the others
    // are circle/region-scoped and must not surface to arbitrary searchers) and
    // only published, non-cancelled, public events.
    admin
      .from('posts')
      .select('id, body, created_at, is_demo, author:profiles!author_id ( display_name, handle, avatar_url )')
      .ilike('body', `%${safeQ}%`)
      .eq('visibility', 'public')
      .is('hidden_at', null)
      .order('created_at', { ascending: false })
      .limit(6),
    eventsBase()
      .gte('starts_at', eventFloor)
      .order('starts_at', { ascending: true })
      .limit(eventFetchLimit),
    // NEWEST first, so the window below the floor holds the most RECENT past dates. The fold elects
    // the latest of them, so a finished series answers with its last date, not its opening night.
    eventsBase()
      .lt('starts_at', eventFloor)
      .order('starts_at', { ascending: false })
      .limit(eventFetchLimit),
    stewardId ? searchVisibleLeads(stewardId, q, { includeNetwork: true }) : Promise.resolve([]),
  ])

  // One row per repeating event, showing its next date. An overlay with six slots cannot spend
  // three of them on three Wednesdays of the same cowork.
  const events = collapseSeriesAroundFloor(
    (eventsUpcomingRes.data ?? []) as unknown as OverlayEventRow[],
    (eventsPastRes.data ?? []) as unknown as OverlayEventRow[],
    EVENT_RESULTS,
    { upcomingFrom: eventFloor, perSeries: TEASER_CARDS_PER_SERIES },
  )

  return NextResponse.json({
    pages,
    people: ((peopleRes.data ?? []) as { id: string }[]).filter(isListableInDirectory).slice(0, 6),
    posts: postsRes.data ?? [],
    events,
    leads: leads ?? [],
  })
}
