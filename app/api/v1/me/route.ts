import { authorizeCaller, toMeView } from '@/lib/contract/caller'
import { fail, ok, rateLimited } from '@/lib/contract/respond'

// GET /api/v1/me: the caller's own profile summary (LIVE-715, ADR-1643). The worked example of the
// app contract, and the first call a native app makes after sign-in: "who am I here?".
//
// The shape every /api/v1 route follows (docs/APP-CONTRACT.md, "Adding an endpoint"):
//   1. rate limit by address, before any credential work;
//   2. authorizeCaller: a bearer token or the web cookie, one CallerProfile either way;
//   3. parse any input with readInput (none here);
//   4. answer with ok / fail, so the envelope and headers are never hand-built.
//
// PRIVACY: own row only. There is no id parameter, so there is nothing to enumerate.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const limited = await rateLimited(request, 'me')
  if (limited) return limited

  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)

  return ok(toMeView(auth))
}
