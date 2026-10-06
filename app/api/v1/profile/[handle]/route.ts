import { z } from 'zod'
import { authorizeCaller } from '@/lib/contract/caller'
import { fail, failFrom, ok, rateLimited, readInput } from '@/lib/contract/respond'
import { toProfileView } from '@/lib/contract/views'
import { getPublicProfileByHandle } from '@/lib/profiles/public-profile'
import { hasBlocked } from '@/lib/blocking'

// GET /api/v1/profile/{handle} (LIVE-716): a member's public profile, the public fields only
// (lib/profiles/public-profile.ts), the same read the web's profile page makes. `blockedByMe` lets
// the app offer unblock. An inactive profile is not_found, as on the web.

export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const limited = await rateLimited(request, 'profile-public')
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    const handle = readInput(z.string().regex(/^[a-z0-9_]{1,40}$/i), (await params).handle).toLowerCase()
    const row = await getPublicProfileByHandle(handle)
    if (!row) return fail('not_found', 'That member could not be found.')
    const { city: _city, ...view } = toProfileView(row)
    void _city
    return ok({ ...view, blockedByMe: row.id === auth.caller.id ? false : await hasBlocked(auth.caller.id, row.id) })
  } catch (e) {
    return failFrom(e)
  }
}
