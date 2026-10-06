import { z } from 'zod'
import { authorizeCaller } from '@/lib/contract/caller'
import { fail, failFrom, ok, rateLimited, readInput } from '@/lib/contract/respond'
import { toCircleView } from '@/lib/contract/views'
import { getPublicCircleById } from '@/lib/discover'

// GET /api/v1/circles/{id} (LIVE-716): one Circle's public card, the same public_circle_by_id read
// the public Circle page uses. A closed or unlisted Circle is not_found here; its members open it
// from their own list.

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimited(request, 'circle')
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    const id = readInput(z.uuid(), (await params).id)
    const circle = await getPublicCircleById(id)
    if (!circle) return fail('not_found', 'That Circle could not be found.')
    return ok(toCircleView(circle))
  } catch (e) {
    return failFrom(e)
  }
}
