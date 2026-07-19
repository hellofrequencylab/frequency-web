// Who may EDIT / manage a Journey — the one authoring gate shared by the editor route and every
// editor server action, so they can never drift.
//
// A Journey is editable by:
//   1. its AUTHOR (author_id), or
//   2. a platform OPERATOR (admin.access — the same bypass the library curation grants), or
//   3. a MANAGER of the Space the Journey belongs to (owner / admin / editor via canEditProfile) —
//      TEAM AUTHORING: a Space's editors may edit the Space's Journeys, not only the one teammate who
//      first created it. A personal (root-space) Journey has no Space managers, so only (1)/(2) apply.
//
// Server-only (reads the caller's session for the operator check + the admin client behind the Space
// resolution). Composes the pure journey/space readers; fail-safe (any miss reads as no access).

import { getGlobalCapabilities } from '@/lib/core/load-capabilities'
import { getSpaceById, loadRootSpaceId } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import { planAuthorId, planSpaceId } from '@/lib/journey-plans'

/** May `callerId` edit/manage Journey `planId`? Author, platform operator, or a manager of the
 *  owning Space (team authoring). FAIL-SAFE: false for a null caller or any resolution miss. */
export async function canEditJourney(
  planId: string,
  callerId: string | null | undefined,
): Promise<boolean> {
  if (!callerId) return false
  const author = await planAuthorId(planId)
  if (author && author === callerId) return true
  if ((await getGlobalCapabilities()).has('admin.access')) return true
  // Team authoring: a manager of the owning Space (not the root/personal space) may edit.
  const spaceId = await planSpaceId(planId)
  const root = await loadRootSpaceId()
  if (spaceId && spaceId !== root) {
    const space = await getSpaceById(spaceId)
    if (space) {
      const caps = await getSpaceCapabilities(space, callerId)
      if (caps.canEditProfile) return true
    }
  }
  return false
}
