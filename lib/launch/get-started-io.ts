// THE GET STARTED LIST AFTER PUBLISH (the read half). Server-only. For a signed-in owner whose Spotlight is
// published, the inventory of their Space (lib/launch/inventory-io.ts: real rows only); otherwise null, and the
// caller shows whatever it showed before. Request-cached so the open rail, its micro face and the Feed's inline copy
// share one read. Never throws: a failed read is "no list".

import { cache } from 'react'
import { launchSystemEnabled } from './enabled'
import { getStartedView, isPublished } from './get-started'
import { loadInventory } from './inventory-io'
import type { InventorySection } from './overview'
import { getLaunchForOwner } from './store'

export const loadPostPublishList = cache(async (profileId: string): Promise<InventorySection[] | null> => {
  if (!launchSystemEnabled()) return null
  try {
    const launch = await getLaunchForOwner(profileId)
    if (!launch?.spaceId) return null
    const inv = await loadInventory(launch.spaceId, profileId, launch.skippedPhotos)
    return inv && isPublished(inv.sections) ? inv.sections : null
  } catch (e) {
    console.error('[launch] get started list read failed; the member sees the plain list:', e instanceof Error ? e.message : String(e))
    return null
  }
})

/** The micro rail's button for the same list: done of total, and how many are left. Null when there is no list. */
export async function launchGetStartedCounts(profileId: string): Promise<{ done: number; total: number; left: number } | null> {
  const sections = await loadPostPublishList(profileId)
  if (!sections) return null
  const v = getStartedView(sections)
  return { done: v.done, total: v.total, left: v.left }
}
