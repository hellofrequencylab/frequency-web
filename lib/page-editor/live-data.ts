import type { SupabaseClient } from '@supabase/supabase-js'
import type { LiveData, LivePost, LiveEvent } from '@/components/marketing/blocks'
import type { LivePricing } from './live-pricing'

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

/** One read's outcome. `ok` is the ONLY way to tell a real empty result from a failed query:
 *  `supabase.rpc()` RESOLVES with `{ data: null, error }` on a query-level failure rather than
 *  rejecting, so `data ?? []` turns a broken RPC into an innocent-looking empty list. */
type RpcRead<T> = { data: T | null; ok: boolean }

/** Settle one RPC into data + delivered. Both ways an RPC can fail land here as `ok: false`:
 *  the `{ data: null, error }` resolution above, and an outright rejection (transport, aborted
 *  fetch). Catching the rejection is what lets six reads run without one taking down the other
 *  five, and what keeps a broken RPC from 500-ing a marketing page. */
async function settle<T>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<RpcRead<T>> {
  try {
    const { data, error } = await query
    return error ? { data: null, ok: false } : { data: (data ?? null) as T | null, ok: true }
  } catch {
    return { data: null, ok: false }
  }
}

// The live social-proof data used by the splash blocks (Stats / Events / Posts).
// Same public RPCs the old hardcoded splash used. Passed to <Render> as metadata.
//
// FAILS SOFT, DOES NOT FAKE. Every field keeps a harmless default (`0`, `[]`) when its read
// fails, so no consumer has to guard a null and no marketing page 500s. The default alone is a
// lie by omission though: `posts: []` reads identically whether the community posted nothing or
// the query broke, and ISR (`revalidate = 3600`) freezes whichever render that produced for an
// hour. So `status` carries the truth per field, and blocks read it via `readLive`.
//
// Posts: prefer Vera's auto-curated featured set (public_featured_posts). When
// nothing has been curated yet, fall back to the latest public posts so the
// "People showing up for each other" section is never empty. `postsCurated`
// flags which path won so the UI can credit Vera only on real picks.
export async function getLiveData(supabase: SupabaseClient): Promise<LiveData> {
  // Pricing rides along so a Tiers card can bind to a live figure instead of freezing one into the
  // published document (ADR-918). Resolved in the same Promise.all, so it costs no extra round trip
  // on the critical path, and fail-safe to {} inside getLivePricing.
  const { getLivePricing } = await import('./live-pricing')
  const [featuredRead, postsRead, memberCountRead, eventsRead, circleCountRead, pricing] =
    await Promise.all([
      settle<PublicPostRow[]>(supabase.rpc('public_featured_posts', { _limit: 6 })),
      settle<PublicPostRow[]>(supabase.rpc('public_posts', { _limit: 3 })),
      settle<number>(supabase.rpc('public_member_count')),
      settle<LiveEvent[]>(supabase.rpc('public_events', { _limit: 3 })),
      settle<number>(supabase.rpc('public_active_circle_count')),
      // getLivePricing already swallows its own failures and returns {}, so there is no error to
      // observe here. The catch only covers it rejecting outright, which would otherwise take the
      // whole Promise.all (and the page) down with it.
      getLivePricing().catch((): LivePricing => ({})),
    ])

  const featured = (featuredRead.data ?? []).map(toLivePost)
  const postsCurated = featured.length > 0
  const posts: LivePost[] = postsCurated ? featured : (postsRead.data ?? []).map(toLivePost)
  // `posts` is only as trustworthy as the read that produced it. A broken featured read is not a
  // failure on its own: the latest-public fallback is the wider set, so if IT delivered, an empty
  // list is a genuine empty. If the fallback is the one that broke, we do not know.
  const postsOk = postsCurated ? featuredRead.ok : postsRead.ok

  return {
    pricing,
    memberCount: memberCountRead.data ?? 0,
    circleCount: circleCountRead.data ?? 0,
    upcomingEvents: eventsRead.data ?? [],
    posts,
    postsCurated,
    status: {
      memberCount: memberCountRead.ok ? 'ok' : 'error',
      circleCount: circleCountRead.ok ? 'ok' : 'error',
      upcomingEvents: eventsRead.ok ? 'ok' : 'error',
      posts: postsOk ? 'ok' : 'error',
    },
  }
}
