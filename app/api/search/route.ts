import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { connectionsOwnerId } from '@/lib/connections/access'
import { searchVisibleLeads } from '@/lib/crm/people-search'
import { rateLimitOk, clientIp, tooMany } from '@/lib/rate-limit'
import { getViewerHats } from '@/lib/core/viewer-hats'
import { accessTo } from '@/lib/core/access-matrix'
import { matchDestinations } from '@/lib/search/destinations'
import { searchPeople, searchPosts, searchEvents, searchCircles, searchSpaces, searchPractices, searchJourneys, searchSpotlights, searchMarket } from '@/app/(main)/search/search-data'
import { browsableAreas } from '@/lib/marketplace/visibility'
import { hiddenRoutes, isHiddenRoute } from '@/lib/search/hidden-routes'

// Live search for the in-app search overlay (components/search/search-overlay.tsx).
// Returns bounded people/posts/events/circles/spaces/practices/journeys/spotlights/market/leads groups as JSON, so
// the overlay can show results as you type. The full /search page is the "see all"
// destination. Mirrors the queries on that page; auth-gated (in-app search).
//
// `leads` are non-member people the viewer is ENTITLED to find — their own captures,
// plus (since they're a steward) network-shared captures from stewards in their own
// locality — gated by lib/crm/visibility. Only stewards/staff have or can see these,
// so we resolve the viewer through connectionsOwnerId() and skip the query otherwise.

const EMPTY = { people: [], posts: [], events: [], circles: [], spaces: [], practices: [], journeys: [], spotlights: [], market: [], leads: [], pages: [] }

export async function GET(request: Request) {
  if (!(await rateLimitOk('search', clientIp(request), 60, '60 s'))) return tooMany()

  const { searchParams } = new URL(request.url)
  // Strip characters that would break a PostgREST or() filter; trim + cap length.
  const q = (searchParams.get('q') ?? '').replace(/[(),]/g, ' ').trim().slice(0, 80)
  if (q.length < 2) return NextResponse.json(EMPTY)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ...EMPTY, error: 'Please sign in again to search Frequency.' }, { status: 401 })

  // Stewards (host+) / staff can also see leads — their own captures and network shares.
  const stewardId = await connectionsOwnerId()

  // Navigable destinations matching the query, gated by the access matrix so a member
  // never sees admin tools (and a visitor never sees member-only pages). Resolved from
  // the live viewer's hats — the same projection the shell uses.
  // SRCH-002: routes the left menu hides never answer; the list also goes back to the overlay so its
  // client-side "Go to" (paletteDestinations) drops them too.
  const [hats, hidden] = await Promise.all([getViewerHats(), hiddenRoutes()])
  const pages = matchDestinations(q)
    .filter((d) => !d.surface || accessTo(d.surface, hats) !== 'none')
    .filter((d) => !isHiddenRoute(d.href, hidden))
    .slice(0, 6)
    .map((d) => ({ href: d.href, label: d.label, group: d.group }))

  try {
    // Market products answer only while the makers area is browsable, the same gate /search uses.
    const marketOn = (await browsableAreas()).includes('makers') && !isHiddenRoute('/market', hidden)
    const kinds = ['people', 'posts', 'events', 'circles', 'spaces', 'practices', 'journeys', 'spotlights', 'market'] as const
    const outcomes = await Promise.allSettled([
      searchPeople(q, 6), searchPosts(q, 4), searchEvents(q, 6),
      searchCircles(q, 6), searchSpaces(q, 6), searchPractices(q, 6),
      searchJourneys(q, 4), searchSpotlights(q, 4), marketOn ? searchMarket(q, 4) : Promise.resolve({ rows: [], truncated: false }),
    ])
    const groups = Object.fromEntries(outcomes.map((outcome, i) => [kinds[i], outcome.status === 'fulfilled' ? outcome.value.rows : []]))
    const unavailable = outcomes.flatMap((outcome, i) => outcome.status === 'rejected' ? [kinds[i]] : [])
    const leads = stewardId ? await searchVisibleLeads(stewardId, q, { includeNetwork: true }) : []
    return NextResponse.json({ ...groups, pages, leads, unavailable, hiddenRoutes: hidden }, {
      status: unavailable.length === kinds.length ? 503 : 200,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch {
    return NextResponse.json({ error: 'Search is temporarily unavailable. Please try again.' }, { status: 503 })
  }
}
