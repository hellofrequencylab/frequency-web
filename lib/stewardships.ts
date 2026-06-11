// Scoped stewardship — server reader (P1.4, ADR-218). The Community axis of the access
// resolver: a profile's stewardship EDGES `(role · scope)` and the derived global
// `community_level`. Pure derivation + types live in lib/core/stewardship.ts (framework-
// independent, unit-tested); this is the Supabase seam. Server-only (admin client). The
// `stewardships` table + `profiles.community_level` aren't in the generated types yet, so
// the queries use the untyped-client cast (repo convention — see lib/personas.ts).
//
// FOUNDATION ONLY: nothing consumes these reads yet (getViewerHats / load-capabilities
// still read the leader FKs + community_role). Reads flip in P1.6 (the unified resolver).

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  type CommunityLevel,
  type ScopeType,
  type StewardRole,
  type StewardState,
  type StewardshipEdge,
  deriveCommunityLevel,
  leadsScope,
} from '@/lib/core/stewardship'
import type { CommunityRole } from '@/lib/core/roles'

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
  const { data } = await (createAdminClient() as unknown as SupabaseClient)
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

/** A profile's derived global Community level — the live recompute of the cache. Pass the
 *  profile's `community_role` as the floor so a legacy global rank never regresses. */
export async function getCommunityLevel(
  profileId: string,
  floorRole: CommunityRole | null | undefined = 'member',
): Promise<CommunityLevel> {
  return deriveCommunityLevel(await getStewardships(profileId), floorRole)
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
