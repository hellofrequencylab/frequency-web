import { z } from 'zod'
import { reactionInput } from '@/lib/contract'
import { asCaller, authorizeCaller } from '@/lib/contract/caller'
import { fail, failFrom, ok, rateLimited, readInput } from '@/lib/contract/respond'
import { toggleReaction } from '@/app/(main)/feed/actions'

// POST /api/v1/feed/posts/{id}/reactions { reaction, active } (LIVE-716): add or remove one of the
// caller's reactions through the web's toggleReaction (the allowed set, RLS as the caller, the
// first-reaction gem rule).

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimited(request, 'feed-reactions', { limit: 120, window: '1 m' })
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    const id = readInput(z.uuid(), (await params).id)
    const { reaction, active } = readInput(reactionInput, await request.json().catch(() => null))
    const res = await asCaller(auth, () => toggleReaction(id, reaction, active))
    if ('error' in res) return fail(res.error === 'Unknown reaction' ? 'invalid_input' : 'internal', res.error)
    return ok(res.data)
  } catch (e) {
    return failFrom(e)
  }
}
