import 'server-only'
import { getMyProfileId } from '@/lib/auth'
import { getSpaceById } from './store'
import { readSpaceMembershipFresh } from './membership'
import { atLeastSpaceRole } from './membership-core'

/** Explicit discovery permission belongs to this Space's owner or active direct editor/admin.
 * Uncached owner/member reads intentionally exclude staff preview and inferred network reach.
 * Re-run after observation IO before returning private aggregates. */
export async function authorizeDiscoveryEditor(spaceId: string) {
  const actor = await getMyProfileId()
  if (!actor) return null
  const space = await getSpaceById(spaceId)
  if (!space) return null
  if (space.ownerProfileId === actor) return { actor, space }
  const member = await readSpaceMembershipFresh(spaceId, actor)
  if (!member || member.status !== 'active' || !atLeastSpaceRole(member.role, 'editor')) return null
  return { actor, space }
}
