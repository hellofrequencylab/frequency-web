import { asCaller, authorizeCaller } from '@/lib/contract/caller'
import { fail, failFrom, ok, rateLimited } from '@/lib/contract/respond'
import { markAllRead } from '@/app/(main)/notifications/actions'

// POST /api/v1/notifications/read (LIVE-716): mark all of the caller's notifications read, the
// web's markAllRead (RLS "users update own" scopes it to the caller's rows).

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const limited = await rateLimited(request, 'notifications-read', { limit: 60, window: '1 m' })
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    await asCaller(auth, () => markAllRead())
    return ok({ read: true as const })
  } catch (e) {
    return failFrom(e)
  }
}
