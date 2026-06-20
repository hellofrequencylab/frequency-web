// PROFILE PRESENCE — the shared "is this Space's profile essentially empty?" + "is the viewer the
// owner?" reads the entity modules use to make a brand-new profile feel INTENTIONAL (ENTITY-SPACES
// §A.3 skeptic test). Two jobs:
//
//   1. `spaceHasContent()` — does the active Space have ANY published content (offerings, practices,
//      journeys, or circles)? When false the About tab shows ONE composite "just getting started"
//      empty (entity-getting-started) instead of N dashed boxes; the per-section modules suppress
//      their own empties so they don't stack under it. Request-CACHED so the four counts run once
//      across every module on the page.
//   2. `viewerCanEditActiveSpace()` — may the current viewer edit the active Space (owner / admin /
//      editor)? When true the empties become ACTIONABLE ("Add your first session", routed to the
//      editor); a plain member sees the quiet "check back" voice. Also request-cached.
//
// Both are fail-safe (any read error → treated as empty / not-owner), so a brand-new or half-seeded
// Space degrades to the calm path rather than throwing.

import { cache } from 'react'
import { getActiveSpace } from './active-space'
import { getMyProfileId } from '@/lib/auth'
import { getSpaceCapabilities } from './entitlements'
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

/** May the current viewer edit the active Space (owner / admin / editor — the canEditProfile gate)?
 *  Request-cached. Fail-safe to false (a denied/anon viewer sees the member-facing empties). */
export const viewerCanEditActiveSpace = cache(async (): Promise<boolean> => {
  const space = getActiveSpace()
  if (!space) return false
  try {
    const viewerProfileId = await getMyProfileId()
    if (!viewerProfileId) return false
    const caps = await getSpaceCapabilities(space, viewerProfileId)
    return caps.canEditProfile
  } catch {
    return false
  }
})
