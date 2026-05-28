import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

// Public landing-page data. Identical for every signed-out visitor, so we
// compute it once and cache it for 60s instead of re-querying Postgres on
// every hit. Uses the admin client (no request cookies) because the result is
// request-independent — a hard requirement for `unstable_cache`. The explicit
// filters (visibility='public', non-cancelled future events) keep the payload
// limited to genuinely public content even though RLS is bypassed.

export interface LandingPost {
  id: string
  body: string | null
  created_at: string
  media_urls: string[] | null
  author: {
    display_name: string
    handle: string
    avatar_url: string | null
    community_role: string
  } | null
}

export interface LandingEvent {
  id: string
  title: string
  starts_at: string
  location: string | null
  slug: string
}

export interface LandingData {
  posts: LandingPost[]
  memberCount: number
  circleCount: number
  upcomingEvents: LandingEvent[]
}

async function fetchLandingData(): Promise<LandingData> {
  const admin = createAdminClient()

  const [postsResult, memberCountResult, eventsResult, circleCountResult] =
    await Promise.all([
      admin
        .from('posts')
        .select(
          `id, body, created_at, media_urls,
           author:profiles!author_id ( display_name, handle, avatar_url, community_role )`
        )
        .eq('visibility', 'public')
        .is('parent_id', null)
        .is('hidden_at', null)
        .order('created_at', { ascending: false })
        .limit(4),
      admin.rpc('public_member_count'),
      admin
        .from('events')
        .select('id, title, starts_at, location, slug')
        .eq('is_cancelled', false)
        .gte('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: true })
        .limit(3),
      admin.rpc('public_active_circle_count'),
    ])

  return {
    posts: (postsResult.data ?? []) as unknown as LandingPost[],
    memberCount: (memberCountResult.data as number | null) ?? 0,
    circleCount: (circleCountResult.data as number | null) ?? 0,
    upcomingEvents: (eventsResult.data ?? []) as LandingEvent[],
  }
}

// Cache for 60s, tagged 'landing' so it can be revalidated on demand later
// (e.g. revalidateTag('landing') after publishing a public post) if desired.
export const getLandingData = unstable_cache(fetchLandingData, ['landing-data'], {
  revalidate: 60,
  tags: ['landing'],
})
