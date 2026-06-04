import type { SupabaseClient } from '@supabase/supabase-js'
import type { LiveData, LivePost, LiveEvent } from '@/components/marketing/blocks'

type PublicPostRow = {
  id: string
  body: string
  created_at: string
  media_urls: string[] | null
  author_display_name: string | null
  author_handle: string | null
  author_avatar_url: string | null
  // Present on featured rows; ignored for the fallback shape.
  featured_at?: string | null
}

function toLivePost(r: PublicPostRow): LivePost {
  return {
    id: r.id,
    body: r.body,
    created_at: r.created_at,
    media_urls: r.media_urls ?? [],
    author: r.author_display_name
      ? { display_name: r.author_display_name, handle: r.author_handle ?? '', avatar_url: r.author_avatar_url }
      : null,
  }
}

// The live social-proof data used by the splash blocks (Stats / Events / Posts).
// Same public RPCs the old hardcoded splash used. Passed to <Render> as metadata.
//
// Posts: prefer Vera's auto-curated featured set (public_featured_posts). When
// nothing has been curated yet, fall back to the latest public posts so the
// "People showing up for each other" section is never empty. `postsCurated`
// flags which path won so the UI can credit Vera only on real picks.
export async function getLiveData(supabase: SupabaseClient): Promise<LiveData> {
  const [featuredResult, postsResult, memberCountResult, eventsResult, circleCountResult] =
    await Promise.all([
      supabase.rpc('public_featured_posts', { _limit: 6 }),
      supabase.rpc('public_posts', { _limit: 3 }),
      supabase.rpc('public_member_count'),
      supabase.rpc('public_events', { _limit: 3 }),
      supabase.rpc('public_active_circle_count'),
    ])

  const featured = ((featuredResult.data ?? []) as PublicPostRow[]).map(toLivePost)
  const postsCurated = featured.length > 0
  const posts: LivePost[] = postsCurated
    ? featured
    : ((postsResult.data ?? []) as PublicPostRow[]).map(toLivePost)

  return {
    memberCount: (memberCountResult.data as number | null) ?? 0,
    circleCount: (circleCountResult.data as number | null) ?? 0,
    upcomingEvents: (eventsResult.data ?? []) as LiveEvent[],
    posts,
    postsCurated,
  }
}
