import { asCaller, authorizeCaller } from '@/lib/contract/caller'
import { failFrom, fail, ok, rateLimited } from '@/lib/contract/respond'
import { listMyCheckinLinks } from '@/lib/spaces/checkin-links'

// GET /api/v1/spaces/checkin-links (LIVE-1115): the signed check-in link of every Space the caller
// runs (owner or active admin), for the app's NFC tag writer. The link is the one the Space's check-in
// settings print as a QR. lib/spaces/checkin-links.ts owns the logic; this route only authorizes and
// answers.
//
// It runs ensureCheckinNode as the caller (asCaller), exactly as opening the web's check-in settings
// does: a Space with no check-in node yet gets its one node, and a Space the caller may not edit is left
// out. A member who runs no Space gets an empty list.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const limited = await rateLimited(request, 'checkin-links', { limit: 30, window: '1 m' })
  if (limited) return limited
  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)
  try {
    const items = await asCaller(auth, () => listMyCheckinLinks(auth.caller.id))
    return ok({ items })
  } catch (e) {
    return failFrom(e)
  }
}
