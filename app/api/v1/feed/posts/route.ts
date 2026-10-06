import { postCreateInput } from '@/lib/contract'
import { asCaller, authorizeCaller } from '@/lib/contract/caller'
import { fail, failFrom, ok, rateLimited, readInput } from '@/lib/contract/respond'
import { createPost } from '@/app/(main)/feed/actions'

// POST /api/v1/feed/posts (LIVE-716): write a post through the web's createPost, which holds every
// rule (the type and visibility allowlists, host-only announcements, the scope relationship gate).

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const limited = await rateLimited(request, 'feed-posts', { limit: 20, window: '10 m' })
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    const input = readInput(postCreateInput, await request.json().catch(() => null))
    if (!input.body?.trim() && !input.imageUrl) return fail('invalid_input', 'Write something to post.')
    const form = new FormData()
    form.set('body', input.body ?? '')
    form.set('scopeId', input.scopeId)
    form.set('visibility', input.visibility)
    form.set('post_type', input.postType)
    if (input.imageUrl) form.set('imageUrl', input.imageUrl)
    const res = await asCaller(auth, () => createPost(form))
    if ('error' in res) return fail('forbidden', res.error)
    return ok({ posted: true as const }, { status: 201 })
  } catch (e) {
    return failFrom(e)
  }
}
