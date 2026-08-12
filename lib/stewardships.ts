// Scoped stewardship — server reader (P1.4, ADR-218). The Community axis of the access
// resolver: a profile's stewardship EDGES `(role · scope)` and the derived global
// `community_level`. Pure derivation + types live in lib/core/stewardship.ts (framework-
// independent, unit-tested); this is the Supabase seam. Server-only (admin client). The
// `stewardships` table + `profiles.community_level` aren't in the generated types yet, so
// the queries use the untyped-client cast (repo convention — see lib/personas.ts).
//
// STATUS (corrected 2026-08-12 — this block used to read "FOUNDATION ONLY: nothing consumes
// these reads yet … reads flip in P1.6"). P1.6 SHIPPED. `getStewardships` is called by
// lib/core/load-capabilities.ts `currentViewer`, which turns the edges into the `leadsScope`
// predicate the resolver ORs with the leader FK, and by `viewerEdgeLevel`, which widens the
// hub/nexus parent walk (ADR-221). The stale note mattered: a reader taking it at face value
// would conclude this table is inert and that a change here is free.
//
// WHAT THESE EDGES STILL DO NOT DO (ADR-1014). `leadsScope` is a BINARY — one active edge on
// `circle:<id>` means full circle leadership. It cannot express a rung, so the circle's own
// role ladder (Admin / Moderator / Member) lives on `memberships.volunteer_role` instead; see
// lib/core/circle-roles.ts. There is still no WRITE path to this table in app code, only a
// DELETE, so every edge today came from the ADR-218 backfill.

import { createAdminClient } from '@/lib/supabase/admin'
import {
  type CommunityLevel,
  type ScopeType,
  type StewardRole,
  type StewardState,
  type StewardshipEdge,
  leadsScope,
} from '@/lib/core/stewardship'

export type {
  CommunityLevel,
  ScopeType,
  StewardRole,
  StewardState,
  StewardshipEdge,
}

function isStewardRole(v: string): v is StewardRole {
  return v === 'crew' || v === 'host' || v === 'guide' || v === 'mentor' || v === 'outpost_lead'
}
function isScopeType(v: string): v is ScopeType {
  return v === 'circle' || v === 'hub' || v === 'nexus' || v === 'outpost'
}

/** Every stewardship edge a profile holds. Unknown roles/scopes (future enum values not
 *  yet known to this build) are filtered out, fail-closed. */
export async function getStewardships(profileId: string): Promise<StewardshipEdge[]> {
  const { data } = await (createAdminClient())
    .from('stewardships')
    .select('role, scope_type, scope_id, state')
    .eq('profile_id', profileId)

  return ((data ?? []) as Array<{
    role: string
    scope_type: string
    scope_id: string
    state: StewardState
  }>)
    .filter((r) => isStewardRole(r.role) && isScopeType(r.scope_type))
    .map((r) => ({
      role: r.role as StewardRole,
      scopeType: r.scope_type as ScopeType,
      scopeId: r.scope_id,
      state: r.state,
    }))
}

/** Does this profile lead the given scope (hold an active edge on it)? The scoped-edge
 *  check the unified resolver (P1.6) will consult alongside the leader FK. */
export async function leadsScopeById(
  profileId: string,
  scopeType: ScopeType,
  scopeId: string,
): Promise<boolean> {
  return leadsScope(await getStewardships(profileId), scopeType, scopeId)
}
