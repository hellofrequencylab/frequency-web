// PROFILE PRESENCE — the shared "is this Space's profile essentially empty?" + "is the viewer the
// owner?" reads the entity modules use to make a brand-new profile feel INTENTIONAL (ENTITY-SPACES
// §A.3 skeptic test). Two jobs:
//
//   1. `spaceHasContent()` — does the active Space have ANY published content (offerings, practices,
//      journeys, or circles)? When false the About tab shows ONE composite "just getting started"
//      empty (entity-getting-started) instead of N dashed boxes; the per-section modules suppress
//      their own empties so they don't stack under it. Request-CACHED so the four counts run once
//      across every module on the page.
//   2. `viewerCanEditActiveSpace()` — should the viewer see the OWNER-facing empties? True for an
//      owner / admin / editor (the canEditProfile authority) AND for a platform janitor previewing a
//      Space they don't manage (read-only), so an admin sees the profile as the owner does. When true
//      the empties become ACTIONABLE ("Add your first session", routed to the management hub); a plain
//      member sees the quiet "check back" voice. Still server-authoritative + read-only (no write gate
//      is widened — the hub renders a read-only staff preview for the janitor). Also request-cached.
//
// Both are fail-safe (any read error → treated as empty / not-owner), so a brand-new or half-seeded
// Space degrades to the calm path rather than throwing.

import { cache } from 'react'
import { getActiveSpace } from './active-space'
import { getCallerProfile } from '@/lib/auth'
import { resolveSpaceManageAccess } from './entitlements'
import { listEventsForSpace } from '@/lib/events/store'
import { listPracticesForSpace } from '@/lib/practices'
import { listJourneyPlansForSpace } from '@/lib/journey-plans'
import { listCirclesForSpace } from '@/lib/circles/store'

/** Does the active Space have ANY published content? Request-cached on the space id so the four
 *  list reads run at most once per request (shared by every entity module). Fail-safe to `true` on
 *  error: when we cannot tell, we DON'T show the "getting started" composite (avoid telling a member
 *  a populated Space is empty); the per-section empties then carry it as before. */
export const spaceHasContent = cache(async (): Promise<boolean> => {
  const space = getActiveSpace()
  if (!space) return true
  try {
    const [events, practices, journeys, circles] = await Promise.all([
      listEventsForSpace(space.id, { limit: 1 }),
      listPracticesForSpace(space.id, 1),
      listJourneyPlansForSpace(space.id, 1),
      listCirclesForSpace(space.id, 1),
    ])
    const liveEvents = events.filter((e) => !e.is_cancelled)
    const activeCircles = circles.filter((c) => c.status === 'active')
    return liveEvents.length > 0 || practices.length > 0 || journeys.length > 0 || activeCircles.length > 0
  } catch {
    return true
  }
})

/** True when the active Space's profile is essentially empty (no published content). The inverse of
 *  spaceHasContent, named for the call sites that branch on emptiness. */
export async function spaceProfileIsEmpty(): Promise<boolean> {
  return !(await spaceHasContent())
}

/** Should the current viewer see the active Space's OWNER-facing, actionable empties ("Add your
 *  first …")? True for someone who can manage the Space (owner / admin / editor — the unchanged
 *  canEditProfile authority) AND for a platform janitor PREVIEWING a Space they do not manage, so an
 *  admin sees the profile as its owner would. STILL READ-ONLY: the empties only link to the settings
 *  hub, which renders a read-only staff preview for the janitor; no write gate is widened here.
 *  Request-cached. Fail-safe to false (a denied/anon viewer sees the member-facing empties). */
export const viewerCanEditActiveSpace = cache(async (): Promise<boolean> => {
  const space = getActiveSpace()
  if (!space) return false
  try {
    const caller = await getCallerProfile()
    if (!caller) return false
    const manage = await resolveSpaceManageAccess(space, caller.id, caller.webRole)
    return manage.canManage || manage.staffViewing
  } catch {
    return false
  }
})
