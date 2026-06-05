import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { searchVisibleLeads } from '@/lib/crm/people-search'

// Live search for the in-app search overlay (components/search/search-overlay.tsx).
// Returns a small slice of people / posts / events / leads for a query as JSON, so
// the overlay can show results as you type. The full /search page is the "see all"
// destination. Mirrors the queries on that page; auth-gated (in-app search).
//
// `leads` are non-member people the viewer is ENTITLED to find (their own captures,
// gated by lib/crm/visibility) — so a steward can search up someone they scanned in,
// which the member directory (profiles only) can't surface.

const EMPTY = { people: [], posts: [], events: [], leads: [] }

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  // Strip characters that would break a PostgREST or() filter; trim + cap length.
  const q = (searchParams.get('q') ?? '').replace(/[(),]/g, ' ').trim().slice(0, 80)
  if (q.length < 2) return NextResponse.json(EMPTY)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json(EMPTY, { status: 401 })

  const viewerProfileId = await getMyProfileId()

  const admin = createAdminClient()
  const [peopleRes, postsRes, eventsRes, leads] = await Promise.all([
    admin
      .from('profiles')
      .select('id, display_name, handle, avatar_url, community_role, is_demo')
      .or(`display_name.ilike.%${q}%,handle.ilike.%${q}%`)
      .eq('is_active', true)
      .order('display_name')
      .limit(6),
    admin
      .from('posts')
      .select('id, body, created_at, is_demo, author:profiles!author_id ( display_name, handle, avatar_url )')
      .ilike('body', `%${q}%`)
      .is('hidden_at', null)
      .order('created_at', { ascending: false })
      .limit(6),
    admin
      .from('events')
      .select('id, title, slug, starts_at, location, is_cancelled, is_demo')
      .or(`title.ilike.%${q}%,description.ilike.%${q}%`)
      .order('starts_at', { ascending: true })
      .limit(6),
    viewerProfileId ? searchVisibleLeads(viewerProfileId, q) : Promise.resolve([]),
  ])

  return NextResponse.json({
    people: peopleRes.data ?? [],
    posts: postsRes.data ?? [],
    events: eventsRes.data ?? [],
    // Only surface leads the viewer can actually open (their own captures) here;
    // network-local sharing is gated for a follow-up review (docs/NETWORK-CRM.md).
    leads: (leads ?? []).filter((l) => l.href),
  })
}
