import 'server-only'
import { cache } from 'react'
import { getSpaceById } from '@/lib/spaces/store'
import { spaceFunctionDef, spaceFunctionEnabled, type SpaceFunctionKey } from '@/lib/spaces/functions'
import { listMembershipTiers } from '@/lib/spaces/memberships'
import { listPublicSpaceCatalog } from '@/lib/commerce/products'
import { getSpacePractices } from '@/lib/spaces/content-data'
import { createPublicClient } from '@/lib/supabase/public'
import { readFeedRpc } from '@/lib/feed/load-feed'
import { newWorldLiveFrom, wallPostsFrom, type NewWorldLive, type NewWorldWallSource } from './new-world-live'

// The server half of lib/sites/new-world-live.ts (LIVE-2053): the Space's memberships, shop and library through the readers
// the Space page already uses, each FAIL-SAFE to empty, plus the four function switches read through the pure resolver
// (default ON; only an explicit off disables, lib/spaces/functions.ts). Request-cached so the site page and anything else
// that asks in the same render share one round.

const EMPTY: NewWorldLive = { plans: { on: false, rows: [] }, shop: { on: false, rows: [] }, posts: { on: false, rows: [] } }

/** The wall as an ANONYMOUS reader sees it (LIVE-2108): the public client, never the cookie one, so the site shows exactly
 *  what a stranger may read. `space_wall_feed` is gated in the database (private.can_read_space_wall); a members-only or
 *  private wall comes back empty and the block draws nothing. Fail-safe to off. */
async function readPublicWall(spaceId: string, slug: string | null) {
  try {
    const res = await createPublicClient().rpc('space_wall_feed', { _space_id: spaceId, _limit: 6 })
    const loaded = readFeedRpc<NewWorldWallSource>('space_wall_feed', res)
    return wallPostsFrom(loaded.kind === 'ok' ? loaded.items : null, slug)
  } catch {
    return wallPostsFrom(null, slug)
  }
}

export const loadNewWorldLive = cache(async (spaceId: string, slug: string | null, wall = false): Promise<NewWorldLive> => {
  try {
    const space = await getSpaceById(spaceId)
    if (!space) return EMPTY
    const on = (fn: SpaceFunctionKey) => {
      const def = spaceFunctionDef(fn)
      return def ? spaceFunctionEnabled(space, def) : false
    }
    const switches = { memberships: on('memberships'), shop: on('shop'), journeys: on('journeys'), practices: on('practices') }
    const [tiers, products, practices, wallList] = await Promise.all([
      switches.memberships ? listMembershipTiers(spaceId) : Promise.resolve([]),
      switches.shop ? listPublicSpaceCatalog(spaceId).catch(() => []) : Promise.resolve([]),
      switches.journeys || switches.practices ? getSpacePractices(spaceId).catch(() => null) : Promise.resolve(null),
      wall ? readPublicWall(spaceId, slug) : Promise.resolve(null),
    ])
    const live = newWorldLiveFrom({ slug, switches, tiers, products, practices })
    return wallList ? { ...live, wall: wallList } : live
  } catch {
    return EMPTY
  }
})
