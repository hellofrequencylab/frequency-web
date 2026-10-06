import { z } from 'zod'
import { capabilityScopeKind, type CapabilitiesView } from '@/lib/contract'
import { asCaller, authorizeCaller } from '@/lib/contract/caller'
import { fail, failFrom, ok, rateLimited, readInput } from '@/lib/contract/respond'
import { loadCapabilitiesForScope } from '@/lib/core/load-capabilities'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { getSpaceById } from '@/lib/spaces/store'

// GET /api/v1/capabilities?kind=<scope>&id=<uuid> (LIVE-717): the capability resolver projected to
// a client, so a native app knows which actions to show on a Circle, Space, event or practice.
// The web renders the same set from the same loaders; the app reads it here.
//
// It is display, never permission. Every write endpoint re-checks on the server
// (docs/CAPABILITIES-AND-MOBILE.md §3), so a stale or tampered answer cannot do anything.
//
// PRIVACY: the answer is the CALLER's own capability set. It says what they may do, not who else
// may; an unknown id resolves to the set a stranger would hold, which reveals nothing.

export const dynamic = 'force-dynamic'

const query = z
  .object({ kind: capabilityScopeKind, id: z.uuid().optional() })
  .refine((q) => q.kind === 'global' || !!q.id, { message: 'id is required for every kind but global', path: ['id'] })

export async function GET(request: Request) {
  const limited = await rateLimited(request, 'capabilities')
  if (limited) return limited

  const auth = await authorizeCaller(request)
  if (!auth.ok) return fail(auth.code, auth.message)

  try {
    const params = Object.fromEntries(new URL(request.url).searchParams)
    const { kind, id } = readInput(query, params)
    const view = await asCaller(auth, async (): Promise<CapabilitiesView> => {
      if (kind === 'space') {
        const space = await getSpaceById(id!)
        const caps = await getSpaceCapabilities(space, auth.caller.id)
        const names = [
          caps.isOwner && 'space.owner',
          caps.isAdmin && 'space.admin',
          caps.canEditProfile && 'space.editProfile',
          caps.canManageMembers && 'space.manageMembers',
          caps.canInvite && 'space.invite',
        ].filter((n): n is string => !!n)
        return { kind, id: id!, capabilities: names, spaceRole: caps.role }
      }
      const set = await loadCapabilitiesForScope({ kind, id })
      return { kind, id: id ?? null, capabilities: [...set].sort(), spaceRole: null }
    })
    return ok(view)
  } catch (e) {
    return failFrom(e)
  }
}
