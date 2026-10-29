// THE LAUNCH INVENTORY (the read half). Looks at what the signed-in owner's Space already has and hands the pure
// inventory its facts. One Space read, then lib/launch/rows.ts for the counts, all under the member's own session.
// Server-only. Never throws: a failed read is "no inventory", and the page falls back to the plain resume card.

import { getSpaceById } from '@/lib/spaces/store'
import { inventorySections } from './inventory'
import type { InventorySection } from './overview'
import { loadLaunchRows } from './rows'

export async function loadInventory(spaceId: string | null, ownerProfileId: string): Promise<InventorySection[] | null> {
  if (!spaceId) return null
  try {
    const space = await getSpaceById(spaceId)
    if (!space) return null
    const rows = await loadLaunchRows(spaceId, ownerProfileId)
    if (!rows) return null
    return inventorySections({ rows, spaceName: space.name, coverImageUrl: space.coverImageUrl ?? null, logoUrl: space.brandLogoUrl ?? null })
  } catch {
    return null
  }
}
