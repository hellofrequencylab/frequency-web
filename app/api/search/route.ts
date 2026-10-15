import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { connectionsOwnerId } from '@/lib/connections/access'
import { searchVisibleLeads } from '@/lib/crm/people-search'
import { rateLimitOk, clientIp, tooMany } from '@/lib/rate-limit'
import { getViewerHats } from '@/lib/core/viewer-hats'
import { accessTo } from '@/lib/core/access-matrix'
import { matchDestinations } from '@/lib/search/destinations'
import { searchPeople, searchPosts, searchEvents, searchCircles, searchSpaces, searchPractices } from '@/app/(main)/search/search-data'

// Live search for the in-app search overlay (components/search/search-overlay.tsx).
// Returns bounded people/posts/events/circles/spaces/practices/leads groups as JSON, so
// the overlay can show results as you type. The full /search page is the "see all"
// destination. Mirrors the queries on that page; auth-gated (in-app search).
//
// `leads` are non-member people the viewer is ENTITLED to find — their own captures,
// plus (since they're a steward) network-shared captures from stewards in their own
// locality — gated by lib/crm/visibility. Only stewards/staff have or can see these,
// so we resolve the viewer through connectionsOwnerId() and skip the query otherwise.

const EMPTY = { people: [], posts: [], events: [], circles: [], spaces: [], practices: [], leads: [], pages: [] }

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
  const hats = await getViewerHats()
  const pages = matchDestinations(q)
    .filter((d) => !d.surface || accessTo(d.surface, hats) !== 'none')
    .slice(0, 6)
    .map((d) => ({ href: d.href, label: d.label, group: d.group }))

  try {
    const kinds = ['people', 'posts', 'events', 'circles', 'spaces', 'practices'] as const
    const outcomes = await Promise.allSettled([
      searchPeople(q, 6), searchPosts(q, 4), searchEvents(q, 6),
      searchCircles(q, 6), searchSpaces(q, 6), searchPractices(q, 6),
    ])
    const groups = Object.fromEntries(outcomes.map((outcome, i) => [kinds[i], outcome.status === 'fulfilled' ? outcome.value.rows : []]))
    const unavailable = outcomes.flatMap((outcome, i) => outcome.status === 'rejected' ? [kinds[i]] : [])
    const leads = stewardId ? await searchVisibleLeads(stewardId, q, { includeNetwork: true }) : []
    return NextResponse.json({ ...groups, pages, leads, unavailable }, {
      status: unavailable.length === kinds.length ? 503 : 200,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch {
    return NextResponse.json({ error: 'Search is temporarily unavailable. Please try again.' }, { status: 503 })
  }
}
