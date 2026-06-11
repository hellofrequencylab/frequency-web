// Server seam: the live caller → the access matrix's `Hats` (access-matrix.ts).
//
// THE ONE PLACE that reads the caller's role / entitlement / personas / staff and
// projects them onto the access matrix, so every surface gates the same way and never
// drifts. Server-only (uses getCallerProfile + the staff lookup) — the client mirrors
// the same matrix from props. Mirrors load-capabilities.ts (the per-scope resolver's
// server seam) for the surface-level matrix.
//
// This is the unified-site spine: a page asks `surfaceAccess('vault')` and reveals the
// matching controls. When the entitlement tier (P2) and personas (P3) tables land, ONLY
// this function changes — every wired surface flips automatically.

import { getCallerProfile, getMyProfileId } from '@/lib/auth'
import { getStaffMember } from '@/lib/staff'
import { getActivePersonas } from '@/lib/personas'
import { leadsScopeById } from '@/lib/stewardships'
import {
  communityStanding,
  roleToLevel,
  type CommunityLevel,
  type ScopeType,
} from './stewardship'
import { type CommunityRole, roleRank } from './roles'
import { deriveTier } from './entitlement'
import {
  accessTo,
  columnsForHats,
  type AccessLevel,
  type Hats,
  type Surface,
} from './access-matrix'

/** A scope the viewer might LEAD by stewardship edge — passed to `surfaceAccess` to
 *  light that scope's in-scope leadership surfaces even for a global-member edge-leader
 *  (P1.6 PR 2, ADR-221). Only circle/hub/nexus carry surface standing today. */
export type SurfaceScope = { type: 'circle' | 'hub' | 'nexus'; id: string }

/** The COMMUNITY level a scope confers on whoever leads it: a circle ⇒ host, a hub ⇒
 *  guide, a nexus ⇒ mentor. Used to elevate the matrix standing for an in-scope edge-
 *  leader, additively. */
function scopeLevel(type: SurfaceScope['type']): CommunityLevel {
  switch (type) {
    case 'circle': return roleToLevel('host')
    case 'hub': return roleToLevel('guide')
    case 'nexus': return roleToLevel('mentor')
  }
}

/** Resolve the live caller's hats. Logged-out ⇒ a visitor. The matrix's community
 *  standing is sourced from the derived `community_level` (ADR-218/221) via
 *  `communityStanding`, which never lowers it below the legacy `community_role`. */
export async function getViewerHats(): Promise<Hats> {
  const profile = await getCallerProfile()
  if (!profile) return { loggedIn: false }

  const [staff, personas] = await Promise.all([
    getStaffMember().catch(() => null),
    getActivePersonas(profile.id).catch(() => []),
  ])
  return {
    loggedIn: true,
    // Community standing from the derived level (floored by community_role) — a no-op
    // for member…mentor, and keeps a global admin/janitor's matrix column. (ADR-221.)
    role: communityStanding(profile.communityLevel, profile.community_role),
    // Entitlement (membership) — the real billing flag, decoupled from the role.
    tier: deriveTier(profile.membershipTier),
    // Partner personas (P3) — each active persona lights its matrix columns.
    personas,
    staff: staff?.role ?? null,
  }
}

/**
 * The caller's access level on a surface — the matrix, resolved for the live viewer.
 *
 * Pass an optional `scope` to get the SCOPED answer (P1.6 PR 2, ADR-221): when the
 * viewer LEADS that scope by stewardship edge (`leadsScopeById`), the community
 * standing for THIS call is elevated to the scope's level (circle⇒host, hub⇒guide,
 * nexus⇒mentor), so the in-scope leadership surfaces (Insight, Vera-AI, …) light up
 * even for a global-member edge-leader. Purely additive — it can never lower access:
 * the elevated standing is the MOST-OPEN of the viewer's global standing and the
 * scope's level. With no `scope` the behavior is exactly the global matrix.
 */
export async function surfaceAccess(
  surface: Surface,
  scope?: SurfaceScope,
): Promise<AccessLevel> {
  const hats = await getViewerHats()
  return accessTo(surface, await applyScope(hats, scope))
}

/** Convenience: does the live caller get FULL function on this surface (optionally
 *  within a scope they lead by edge)? */
export async function canUseSurface(
  surface: Surface,
  scope?: SurfaceScope,
): Promise<boolean> {
  return (await surfaceAccess(surface, scope)) === 'full'
}

/** Additively elevate `hats.role` to a led scope's level. No scope, not logged in, or
 *  not an in-scope edge-leader ⇒ hats unchanged (today's global behavior). */
async function applyScope(hats: Hats, scope?: SurfaceScope): Promise<Hats> {
  if (!scope || !hats.loggedIn) return hats
  const profileId = await getMyProfileId()
  if (!profileId) return hats
  if (!(await leadsScopeById(profileId, scope.type as ScopeType, scope.id))) return hats
  // Most-open of the global standing and the scope's level — never a downgrade.
  const scopeRole = scopeLevel(scope.type) as CommunityRole
  const elevated = roleRank(scopeRole) >= roleRank(hats.role) ? scopeRole : hats.role
  return { ...hats, role: elevated }
}

/**
 * Does the live caller hold the paid ("crew") entitlement? The single source for the
 * scattered `['crew','host',…].includes(role)` gamification checks. The matrix's `crew`
 * column is lit ONLY by `isPaid(tier)` (the real `membership_tier`, ADR-207/225) —
 * fully decoupled from the community role — so this is the live paid predicate.
 */
export async function isPaidViewer(): Promise<boolean> {
  return columnsForHats(await getViewerHats()).has('crew')
}
