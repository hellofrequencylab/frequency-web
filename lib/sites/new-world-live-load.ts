import 'server-only'
import { cache } from 'react'
import { getSpaceById } from '@/lib/spaces/store'
import { spaceFunctionDef, spaceFunctionEnabled, type SpaceFunctionKey } from '@/lib/spaces/functions'
import { listMembershipTiers } from '@/lib/spaces/memberships'
import { listPublicSpaceCatalog } from '@/lib/commerce/products'
import { getSpacePractices } from '@/lib/spaces/content-data'
import { newWorldLiveFrom, type NewWorldLive } from './new-world-live'

// The server half of lib/sites/new-world-live.ts (LIVE-2053): the Space's memberships, shop and library through the readers
// the Space page already uses, each FAIL-SAFE to empty, plus the four function switches read through the pure resolver
// (default ON; only an explicit off disables, lib/spaces/functions.ts). Request-cached so the site page and anything else
// that asks in the same render share one round.

const EMPTY: NewWorldLive = { plans: { on: false, rows: [] }, shop: { on: false, rows: [] }, posts: { on: false, rows: [] } }

export const loadNewWorldLive = cache(async (spaceId: string, slug: string | null): Promise<NewWorldLive> => {
  try {
    const space = await getSpaceById(spaceId)
    if (!space) return EMPTY
    const on = (fn: SpaceFunctionKey) => {
      const def = spaceFunctionDef(fn)
      return def ? spaceFunctionEnabled(space, def) : false
    }
    const switches = { memberships: on('memberships'), shop: on('shop'), journeys: on('journeys'), practices: on('practices') }
    const [tiers, products, practices] = await Promise.all([
      switches.memberships ? listMembershipTiers(spaceId) : Promise.resolve([]),
      switches.shop ? listPublicSpaceCatalog(spaceId).catch(() => []) : Promise.resolve([]),
      switches.journeys || switches.practices ? getSpacePractices(spaceId).catch(() => null) : Promise.resolve(null),
    ])
    return newWorldLiveFrom({ slug, switches, tiers, products, practices })
  } catch {
    return EMPTY
  }
})
