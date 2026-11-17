// WHICH LIVE SECTIONS A SPACE MAY PLACE ON THE CANVAS (PROG-E6F). The Space page builder's own rule, not a second
// one: partitionSpaceBlocks with the Space's function switches and the set of function-backed sections that have
// data now (ADR-516 Phase D, ADR-573 item 6), so the canvas never offers an empty Offerings or a Booking section
// whose switch is off. Server only: the data check reads the database.
//
// Fail-safe, and loud about it: the readers are loaded on demand, and if any of them cannot load or throws, the
// canvas offers no live section at all (stricter than the builder's own transient-miss rule) and the miss is
// logged, so a quiet empty list is never mistaken for "nothing to add".

import type { Space } from '@/lib/spaces/types'
import { liveSections } from './canvas-presets'

export async function canvasLiveBlockIds(space: Pick<Space, 'id' | 'type' | 'entitlements'>): Promise<string[]> {
  try {
    const [sources, { partitionSpaceBlocks }, { enabledFunctionKeys }] = await Promise.all([
      import('@/lib/entity-blocks/block-data-sources'),
      import('@/lib/entity-blocks/space-blocks'),
      import('@/lib/spaces/profile-modules'),
    ])
    const existing = await sources.existingFunctionBackedBlocks(space.id)
    const { arrangeable } = partitionSpaceBlocks(enabledFunctionKeys(space), { functionBacked: new Set(sources.FUNCTION_BACKED_BLOCK_TYPES), existing })
    const open = new Set(arrangeable.map((block) => block.id))
    return liveSections().filter((block) => open.has(block.id)).map((block) => block.id)
  } catch (error) {
    console.warn('[canvas] live sections: the lock check failed, so none are offered', error)
    return []
  }
}
