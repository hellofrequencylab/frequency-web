import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { connectionsOwnerId } from '@/lib/connections/access'
import { searchVisibleLeads } from '@/lib/crm/people-search'
import { rateLimitOk, clientIp, tooMany } from '@/lib/rate-limit'

// Live search for the in-app search overlay (components/search/search-overlay.tsx).
// Returns a small slice of people / posts / events / leads for a query as JSON, so
// the overlay can show results as you type. The full /search page is the "see all"
// destination. Mirrors the queries on that page; auth-gated (in-app search).
//
// `leads` are non-member people the viewer is ENTITLED to find — their own captures,
// plus (since they're a steward) network-shared captures from stewards in their own
// locality — gated by lib/crm/visibility. Only stewards/staff have or can see these,
// so we resolve the viewer through connectionsOwnerId() and skip the query otherwise.

const EMPTY = { people: [], posts: [], events: [], leads: [] }

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

  const admin = createAdminClient()
  const [peopleRes, postsRes, eventsRes, leads] = await Promise.all([
    admin
      .from('profiles')
      .select('id, display_name, handle, avatar_url, community_role, is_demo')
      .or(`display_name.ilike.%${safeQ}%,handle.ilike.%${safeQ}%`)
      .eq('is_active', true)
      .order('display_name')
      .limit(6),
    admin
      .from('posts')
      .select('id, body, created_at, is_demo, author:profiles!author_id ( display_name, handle, avatar_url )')
      .ilike('body', `%${safeQ}%`)
      .is('hidden_at', null)
      .order('created_at', { ascending: false })
      .limit(6),
    admin
      .from('events')
      .select('id, title, slug, starts_at, location, is_cancelled, is_demo')
      .or(`title.ilike.%${safeQ}%,description.ilike.%${safeQ}%`)
      .order('starts_at', { ascending: true })
      .limit(6),
    stewardId ? searchVisibleLeads(stewardId, q, { includeNetwork: true }) : Promise.resolve([]),
  ])

  return NextResponse.json({
    people: peopleRes.data ?? [],
    posts: postsRes.data ?? [],
    events: eventsRes.data ?? [],
    leads: leads ?? [],
  })
}
