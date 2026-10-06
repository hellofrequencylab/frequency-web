import { blockInput } from '@/lib/contract'
import { authorizeCaller } from '@/lib/contract/caller'
import { fail, failFrom, ok, rateLimited, readInput } from '@/lib/contract/respond'
import { blockUser, unblockUser } from '@/lib/blocking'

// /api/v1/blocks (LIVE-723, App Store 1.2): block and unblock a member from the app.
//
//   POST   { profileId } blocks: no DMs either way, hidden from each other, and unfriended.
//   DELETE { profileId } unblocks.
//
// The blocker is always the verified caller; the body names only who is blocked. Same lib/blocking
// functions the profile page and Settings call.

export const dynamic = 'force-dynamic'

async function handle(request: Request, block: boolean) {
  const limited = await rateLimited(request, 'blocks', { limit: 30, window: '10 m' })
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    const { profileId } = readInput(blockInput, await request.json().catch(() => null))
    if (profileId === auth.caller.id) return fail('invalid_input', 'You cannot block yourself.')
    const res = block ? await blockUser(auth.caller.id, profileId) : await unblockUser(auth.caller.id, profileId)
    if (!res.ok) return fail('internal', res.error)
    return ok({ blocked: block })
  } catch (e) {
    return failFrom(e)
  }
}

export async function POST(request: Request) {
  return handle(request, true)
}

export async function DELETE(request: Request) {
  return handle(request, false)
}
