// PLACE-TREE AUDIENCE SELECTORS (CRM Master Build Plan §Phase 5 — "Unified segments").
//
// One audience type, both worlds. A campaign / dispatch / segment can now target the PLACE TREE
// (a Circle, a Hub, or a Nexus) exactly the way it targets a trait segment or a built-in audience.
// A place-tree selector is a string `circle:<id>` / `hub:<id>` / `nexus:<id>`; resolving it walks the
// tree down to memberships and returns the PROFILE IDS of every active member in that scope. The
// caller maps those profile ids onto contacts (the send-seam shape) just like the trait path does.
//
// This is the same fan-out the broadcast dispatch already did inline (circle -> memberships; hub ->
// its circles -> memberships; nexus -> its hubs -> circles -> memberships). Factored here so BOTH
// the audience resolvers (lib/spaces/audiences.ts, lib/studio/campaigns.ts) and the broadcast fan-out
// (app/(main)/nearby/actions.ts) resolve a place through ONE tested path, and the broadcast's
// recipient log lines up with what a campaign to the same scope would reach.
//
// FAIL-SAFE: every read returns [] on any error / missing data, never throws, never leaks across
// scopes (a circle resolves only its own memberships). Service-role; the CALLER gates authorization.

import { createAdminClient } from '@/lib/supabase/admin'
import { readAudiencePages, AUDIENCE_PAGE_SIZE, AUDIENCE_ROW_LIMIT, AUDIENCE_ID_BATCH } from './audience-pages'

// ── Types + pure parsing (no IO, testable) ────────────────────────────────────────────────────

/** A place-tree tier. Kept in lock-step with the broadcast `audience_scope` grammar (minus global). */
export type PlaceType = 'circle' | 'hub' | 'nexus'

const PLACE_TYPES: readonly PlaceType[] = ['circle', 'hub', 'nexus']

/** A parsed place selector: which tier, and the id of the entity within it. */
interface PlaceSelector {
  type: PlaceType
  id: string
}

/**
 * Parse a place-tree selector string (`circle:<id>` / `hub:<id>` / `nexus:<id>`) into a
 * PlaceSelector, or null when it is not a place selector (a trait key, a built-in, junk). Pure,
 * fail-safe: a prefix with no id (`circle:`) reads as null so a malformed selector never resolves to
 * an unbounded audience.
 */
export function parsePlaceSelector(raw: unknown): PlaceSelector | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  for (const type of PLACE_TYPES) {
    const prefix = `${type}:`
    if (s.startsWith(prefix)) {
      const id = s.slice(prefix.length).trim()
      return id ? { type, id } : null
    }
  }
  return null
}

/** Pure: is this key a place-tree selector at all? */
export function isPlaceSelector(raw: unknown): boolean {
  return parsePlaceSelector(raw) !== null
}


// ── IO: resolve a place selector down to the active-member profile ids ──────────────────────────

/**
 * Resolve a place-tree selector to the DISTINCT profile ids of its active members. Walks the tree:
 *   circle -> its own active memberships
 *   hub    -> every circle in the hub -> their active memberships
 *   nexus  -> every hub -> every circle -> their active memberships
 * This mirrors the broadcast dispatch fan-out (app/(main)/nearby/actions.ts) so a campaign to a
 * scope reaches exactly the members a dispatch to that scope would. FAIL-SAFE to [] on any error.
 */
export async function resolvePlaceTreeProfileIds(selector: PlaceSelector): Promise<string[]> {
  const { type, id } = selector
  if (!id) return []
  try {
    const admin = createAdminClient()

    let circleIds: string[] = []
    if (type === 'circle') {
      circleIds = [id]
    } else if (type === 'hub') {
      const circles = await readAudiencePages((after) => {
        const q = admin.from('circles').select('id').eq('hub_id', id).order('id').limit(AUDIENCE_PAGE_SIZE)
        return after ? q.gt('id', after) : q
      })
      circleIds = circles.map((circle) => circle.id)
    } else {
      const hubs = await readAudiencePages((after) => {
        const q = admin.from('hubs').select('id').eq('nexus_id', id).order('id').limit(AUDIENCE_PAGE_SIZE)
        return after ? q.gt('id', after) : q
      })
      for (let offset = 0; offset < hubs.length; offset += AUDIENCE_ID_BATCH) {
        const hubIds = hubs.slice(offset, offset + AUDIENCE_ID_BATCH).map((hub) => hub.id)
        const circles = await readAudiencePages((after) => {
          const q = admin.from('circles').select('id').in('hub_id', hubIds).order('id').limit(AUDIENCE_PAGE_SIZE)
          return after ? q.gt('id', after) : q
        })
        circleIds.push(...circles.map((circle) => circle.id))
        if (circleIds.length > AUDIENCE_ROW_LIMIT) throw new Error('Audience scope exceeds the bounded read limit')
      }
    }
    if (circleIds.length === 0) return []

    const ids = new Set<string>()
    for (let offset = 0; offset < circleIds.length; offset += AUDIENCE_ID_BATCH) {
      const batch = circleIds.slice(offset, offset + AUDIENCE_ID_BATCH)
      const memberships = await readAudiencePages((after) => {
        const q = admin.from('memberships').select('id, profile_id').in('circle_id', batch)
          .eq('status', 'active').order('id').limit(AUDIENCE_PAGE_SIZE)
        return after ? q.gt('id', after) : q
      })
      for (const membership of memberships) if (membership.profile_id) ids.add(membership.profile_id)
      if (ids.size > AUDIENCE_ROW_LIMIT) throw new Error('Audience exceeds the bounded read limit')
    }
    return [...ids]

  } catch {
    return []
  }
}

// 2026-09-05 (scan2 L9-13): the parse-and-resolve convenience resolvePlaceSelectorProfileIds was removed;
// every caller parses with parsePlaceSelector and resolves with resolvePlaceTreeProfileIds itself.
