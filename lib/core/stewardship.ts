// Scoped stewardship — the Community role AXIS as edges, not a single global rank
// (P1.4, ADR-218; docs/ROLES.md §"System 1"). A role is a stewardship EDGE
// `(person · role · scope)`; the global `community_level` is DERIVED from the highest
// edge a person holds anywhere. Framework-independent (no Next/Supabase imports), like
// the rest of lib/core — the web app, the future mobile app, and the SQL trigger
// (recompute_community_level, migration 20260614100000) all share this one derivation.
//
// FOUNDATION ONLY (additive, behavior-preserving): the edges + the cache exist and are
// populated, but no read path consumes them yet (getViewerHats / load-capabilities /
// requireScopedManage still read the leader FKs + community_role). Reads flip in P1.6
// (the unified resolver). community_level is floored by community_role so no current
// leader regresses — see communityRoleToLevel.

import type { CommunityRole } from './roles'

/** A scoped management role. `crew` is the in-circle helper rung (distinct from the
 *  retired global `crew` enum value and the `crew` billing tier); `outpost_lead` is the
 *  P1.5 overlay convening role (forward-compat — no edges seeded yet). */
export type StewardRole = 'crew' | 'host' | 'guide' | 'mentor' | 'outpost_lead'

/** The place a stewardship edge is scoped to. */
export type ScopeType = 'circle' | 'hub' | 'nexus' | 'outpost'

/** An edge's lifecycle — `suspended` edges are retained for history but excluded from
 *  the derivation (a removed leader keeps no standing). */
export type StewardState = 'active' | 'suspended'

/** The derived global Community trust level cached on `profiles.community_level`. A
 *  strict subset of the legacy `community_role` ladder (no admin/janitor — staff is the
 *  web_role axis, ADR-208). */
export type CommunityLevel = 'member' | 'crew' | 'host' | 'guide' | 'mentor'

/** A stewardship edge as read from the table (the fields the derivation needs). */
export interface StewardshipEdge {
  role: StewardRole
  scopeType: ScopeType
  scopeId: string
  state?: StewardState
}

export const STEWARD_ROLES: readonly StewardRole[] = [
  'crew', 'host', 'guide', 'mentor', 'outpost_lead',
] as const

export const SCOPE_TYPES: readonly ScopeType[] = [
  'circle', 'hub', 'nexus', 'outpost',
] as const

// Ascending trust: member < crew < host < guide < mentor. THE ladder the derivation
// ranks on; kept in lock-step with the SQL CASE in recompute_community_level().
export const COMMUNITY_LEVELS: readonly CommunityLevel[] = [
  'member', 'crew', 'host', 'guide', 'mentor',
] as const

/** Numeric rank of a level (0 = member … 4 = mentor). */
export function levelRank(level: CommunityLevel): number {
  return COMMUNITY_LEVELS.indexOf(level)
}

/** The trust level a single edge contributes. `outpost_lead` is an overlay convening
 *  role and does NOT raise the level on its own (its holder's trust comes from any
 *  co-held host/guide/mentor edge) → it contributes `member`. */
export function roleToLevel(role: StewardRole): CommunityLevel {
  switch (role) {
    case 'crew': return 'crew'
    case 'host': return 'host'
    case 'guide': return 'guide'
    case 'mentor': return 'mentor'
    case 'outpost_lead': return 'member'
  }
}

/** The FLOOR a legacy `community_role` contributes to the derived level — so nobody
 *  regresses while the global role still exists. admin/janitor floor to `mentor` (the
 *  top community level) so their community `>= 'host'` gates are preserved; the staff
 *  authority itself lives on web_role (ADR-208), not here. */
export function communityRoleToLevel(role: CommunityRole | null | undefined): CommunityLevel {
  switch (role) {
    case 'crew': return 'crew'
    case 'host': return 'host'
    case 'guide': return 'guide'
    case 'mentor':
    case 'admin':
    case 'janitor': return 'mentor'
    default: return 'member' // 'member' / null / unknown
  }
}

/** Whether an edge counts toward the derivation (active; absent state ⇒ active). */
function isActive(edge: StewardshipEdge): boolean {
  return (edge.state ?? 'active') === 'active'
}

/**
 * Derive the global `community_level` from a person's edges, floored by their legacy
 * `community_role`. The single source of truth, mirrored byte-for-byte by the SQL
 * `recompute_community_level()` (migration 20260614100000) so the cache and the app
 * never drift. Only ACTIVE edges count; the highest contributed level (or the floor,
 * whichever is greater) wins.
 */
export function deriveCommunityLevel(
  edges: readonly StewardshipEdge[],
  floorRole: CommunityRole | null | undefined = 'member',
): CommunityLevel {
  let rank = levelRank(communityRoleToLevel(floorRole))
  for (const edge of edges) {
    if (!isActive(edge)) continue
    rank = Math.max(rank, levelRank(roleToLevel(edge.role)))
  }
  return COMMUNITY_LEVELS[rank]
}

/** Does this person lead the given scope (hold an active edge on it)? The scoped-edge
 *  predicate the unified resolver (P1.6) will consult alongside the leader FK. */
export function leadsScope(
  edges: readonly StewardshipEdge[],
  scopeType: ScopeType,
  scopeId: string,
): boolean {
  return edges.some(
    (e) => isActive(e) && e.scopeType === scopeType && e.scopeId === scopeId,
  )
}
