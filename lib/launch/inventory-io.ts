// THE LAUNCH INVENTORY (the read half). Looks at what the signed-in owner's Space already has and hands the pure
// inventory its facts. One Space read, then lib/launch/rows.ts for the counts, all under the member's own session.
// Server-only. Never throws: a failed read is "no inventory", and the page falls back to the plain resume card.

import { getSpaceById } from '@/lib/spaces/store'
import { inventorySections } from './inventory'
import type { InventorySection } from './overview'
import { SPACE_MODULES } from '@/lib/admin/modules/space-modules'
import { loadLaunchRows } from './rows'
import { OFFER_PAGE_HREF_KEY, personalSection } from './setup-items'
import { getFounderTasks } from '@/lib/onboarding/founder-tasks'

export interface Inventory {
  sections: InventorySection[]
  /** Where a photo upload lands: the same Space record the items read. */
  space: { id: string; slug: string }
}

export async function loadInventory(spaceId: string | null, ownerProfileId: string, skippedPhotos: readonly string[] = [], extended = false): Promise<Inventory | null> {
  if (!spaceId) return null
  try {
    const space = await getSpaceById(spaceId)
    if (!space) return null
    const rows = await loadLaunchRows(spaceId, ownerProfileId, extended)
    if (!rows) return null
    const hrefs: Record<string, string> = Object.fromEntries(SPACE_MODULES.filter((m) => m.deepLink).map((m) => [m.id, m.deepLink!(space.slug)]))
    hrefs[OFFER_PAGE_HREF_KEY] = `/spaces/${space.slug}/manage/offer`
    const sections = inventorySections({ rows, spaceName: space.name, coverImageUrl: space.coverImageUrl ?? null, logoUrl: space.brandLogoUrl ?? null, skippedPhotos, extended, hrefs })
    if (extended) {
      const founder = await getFounderTasks(ownerProfileId).catch(() => null)
      if (founder) sections.push(personalSection(founder.tasks))
    }
    return { sections, space: { id: space.id, slug: space.slug } }
  } catch {
    return null
  }
}
