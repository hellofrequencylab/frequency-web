// Public entry point for the Spaces tenancy layer. The spaces↔verticals join lives here:
// a Space turns registered verticals (lib/verticals) on; this resolves which are active.

import { VERTICALS, type Vertical } from '@/lib/verticals'
import type { Space } from './types'

export type { Space, SpaceType, SpaceStatus } from './types'
export * from './store'

/**
 * The verticals active for a Space. The root space exposes every registered vertical (the
 * full Frequency app); a non-root Space exposes only the ones it has switched on
 * (`enabledVerticals`). This is the "a Space selects registered modules" join (ADR-249 §5).
 */
export function activeVerticalsForSpace(space: Space): Vertical[] {
  if (space.type === 'root') return [...VERTICALS]
  const on = new Set(space.enabledVerticals)
  return VERTICALS.filter((v) => on.has(v.id))
}

/** Whether a Space exposes a given registered vertical. */
export function spaceEnablesVertical(space: Space, verticalId: string): boolean {
  if (space.type === 'root') return VERTICALS.some((v) => v.id === verticalId)
  return space.enabledVerticals.includes(verticalId)
}
