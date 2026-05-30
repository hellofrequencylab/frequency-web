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
}

// The live social-proof data used by the splash blocks (Stats / Events / Posts).
// Same public RPCs the old hardcoded splash used. Passed to <Render> as metadata.
export async function getLiveData(supabase: SupabaseClient): Promise<LiveData> {
  const [postsResult, memberCountResult, eventsResult, circleCountResult] = await Promise.all([
    supabase.rpc('public_posts', { _limit: 3 }),
    supabase.rpc('public_member_count'),
    supabase.rpc('public_events', { _limit: 3 }),
    supabase.rpc('public_active_circle_count'),
  ])

  const posts: LivePost[] = ((postsResult.data ?? []) as PublicPostRow[]).map((r) => ({
    id: r.id,
    body: r.body,
    created_at: r.created_at,
    media_urls: r.media_urls ?? [],
    author: r.author_display_name
      ? { display_name: r.author_display_name, handle: r.author_handle ?? '', avatar_url: r.author_avatar_url }
      : null,
  }))

  return {
    memberCount: (memberCountResult.data as number | null) ?? 0,
    circleCount: (circleCountResult.data as number | null) ?? 0,
    upcomingEvents: (eventsResult.data ?? []) as LiveEvent[],
    posts,
  }
}
