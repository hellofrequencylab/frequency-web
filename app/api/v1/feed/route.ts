import { feedQuery } from '@/lib/contract'
import { asCaller, authorizeCaller } from '@/lib/contract/caller'
import { fail, failFrom, ok, rateLimited, readInput } from '@/lib/contract/respond'
import { toFeedPostView } from '@/lib/contract/views'
import { loadFeedPage } from '@/lib/feed/feed-page'

// GET /api/v1/feed?sort=&scope= (LIVE-716): one page of the caller's feed, through the same feed
// RPCs and ranking as the web (lib/feed/feed-page.ts). `scope` narrows to one Circle or channel.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const limited = await rateLimited(request, 'feed')
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    const q = readInput(feedQuery, Object.fromEntries(new URL(request.url).searchParams))
    const loaded = await asCaller(auth, () => loadFeedPage({ profileId: auth.caller.id, sort: q.sort, scopeId: q.scope ?? null }))
    if (loaded.kind === 'error') return fail('internal', 'The feed did not load. Try again.')
    return ok({ items: loaded.items.map((p) => toFeedPostView(p, auth.caller.id)), nextCursor: null })
  } catch (e) {
    return failFrom(e)
  }
}
