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
// (app/(main)/broadcast/actions.ts) resolve a place through ONE tested path, and the broadcast's
// recipient log lines up with what a campaign to the same scope would reach.
//
// FAIL-SAFE: every read returns [] on any error / missing data, never throws, never leaks across
// scopes (a circle resolves only its own memberships). Service-role; the CALLER gates authorization.

import { createAdminClient } from '@/lib/supabase/admin'

// ── Types + pure parsing (no IO, testable) ────────────────────────────────────────────────────

/** A place-tree tier. Kept in lock-step with the broadcast `audience_scope` grammar (minus global). */
export type PlaceType = 'circle' | 'hub' | 'nexus'

export const PLACE_TYPES: readonly PlaceType[] = ['circle', 'hub', 'nexus']

/** A parsed place selector: which tier, and the id of the entity within it. */
export interface PlaceSelector {
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

// Hard cap so a malformed / hostile selector can never resolve an unbounded profile list in one pass.
const MAX_PROFILE_IDS = 20_000

// ── IO: resolve a place selector down to the active-member profile ids ──────────────────────────

/**
 * Resolve a place-tree selector to the DISTINCT profile ids of its active members. Walks the tree:
 *   circle -> its own active memberships
 *   hub    -> every circle in the hub -> their active memberships
 *   nexus  -> every hub -> every circle -> their active memberships
 * This mirrors the broadcast dispatch fan-out (app/(main)/broadcast/actions.ts) so a campaign to a
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
      const { data } = await admin.from('circles').select('id').eq('hub_id', id)
      circleIds = (data ?? []).map((c) => c.id as string)
    } else {
      // nexus -> hubs -> circles
      const { data: hubs } = await admin.from('hubs').select('id').eq('nexus_id', id)
      const hubIds = (hubs ?? []).map((h) => h.id as string)
      if (hubIds.length === 0) return []
      const { data } = await admin.from('circles').select('id').in('hub_id', hubIds)
      circleIds = (data ?? []).map((c) => c.id as string)
    }
    if (circleIds.length === 0) return []

    const { data: mems } = await admin
      .from('memberships')
      .select('profile_id')
      .in('circle_id', circleIds)
      .eq('status', 'active')

    const ids = [
      ...new Set((mems ?? []).map((m) => m.profile_id as string).filter((p): p is string => Boolean(p))),
    ]
    return ids.slice(0, MAX_PROFILE_IDS)
  } catch {
    return []
  }
}

/** Convenience: parse + resolve in one call. FAIL-SAFE to [] when the string is not a place selector. */
export async function resolvePlaceSelectorProfileIds(raw: unknown): Promise<string[]> {
  const sel = parsePlaceSelector(raw)
  return sel ? resolvePlaceTreeProfileIds(sel) : []
}
