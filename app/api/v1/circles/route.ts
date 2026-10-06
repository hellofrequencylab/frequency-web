import { authorizeCaller } from '@/lib/contract/caller'
import { fail, failFrom, ok, rateLimited } from '@/lib/contract/respond'
import { toCircleView } from '@/lib/contract/views'
import { listMyCircles } from '@/lib/circles/store'

// GET /api/v1/circles (LIVE-716): the Circles the caller is an active member of, newest first.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const limited = await rateLimited(request, 'circles')
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    const circles = await listMyCircles(auth.caller.id)
    return ok({ items: circles.map(toCircleView), nextCursor: null })
  } catch (e) {
    return failFrom(e)
  }
}
