// "View as a role under you" — the shared override helper.
//
// Any steward HOST and above can preview the app as a role BELOW their own (a guide
// sees what a host/crew/member sees, etc.). The chosen role lives in an httpOnly
// cookie (set only via the server action, after a real-role check) and is resolved
// into an *effective* community role here. Both role read-paths apply it — the (main)
// layout (nav gating) and lib/auth.ts `resolveCaller` (capability resolver + server
// enforcement) — so the preview is consistent and faithful.
//
// SECURITY: view-as is DOWNGRADE-ONLY — the effective role is the target only when it
// ranks strictly below the caller's REAL role. It can never escalate privilege, even
// if someone forges the cookie (a forged at-or-above target is ignored).

import { cookies } from 'next/headers'
import { ROLE_HIERARCHY, atLeastRole, roleRank, type CommunityRole } from '@/lib/core/roles'
import { isPreviewableEntityRole } from '@/lib/spaces/entity-roles'
import type { SpaceType } from '@/lib/spaces/types'

export const VIEW_AS_COOKIE = 'freq-view-as'

/** The cookie prefix that marks an ENTITY-role preview target (the separate `spaces.type` axis),
 *  e.g. `entity:practitioner`. A community-ladder target ('visitor' or a CommunityRole) carries no
 *  prefix, so the two axes can never collide in the one cookie. */
const ENTITY_PREFIX = 'entity:'

/** Who may use "view as": any steward Host and above. */
export function canViewAs(realRole: CommunityRole): boolean {
  return atLeastRole(realRole, 'host')
}

/**
 * A view-as target is one of two AXES (docs/NAMING.md §Roles, ADR-340):
 *  - the COMMUNITY ladder: a `CommunityRole`, or 'visitor' (the logged-out preview); resolved into
 *    an effective community role by `applyViewAs` (downgrade-only).
 *  - an ENTITY role: `{ kind: 'entity', type }` over the provisionable `SpaceType` set. An entity
 *    role only has meaning INSIDE a Space, so it does NOT downgrade the community role; it routes
 *    the previewer into a representative Space of that type (resolved by the selector / action).
 */
export type ViewAsTarget =
  | CommunityRole
  | 'visitor'
  | { kind: 'entity'; type: SpaceType }

function isCommunityRole(v: string | undefined | null): v is CommunityRole {
  return !!v && (ROLE_HIERARCHY as readonly string[]).includes(v)
}

/** The raw cookie value (a string) parsed into a target, or null when it is not a recognized one.
 *  An `entity:<type>` value is accepted ONLY for a provisionable entity role, so a forged or stale
 *  value can never name a non-provisionable type. */
export function parseViewAsCookie(value: string | undefined | null): ViewAsTarget | null {
  if (!value) return null
  if (value.startsWith(ENTITY_PREFIX)) {
    const type = value.slice(ENTITY_PREFIX.length)
    return isPreviewableEntityRole(type) ? { kind: 'entity', type } : null
  }
  if (value === 'visitor' || isCommunityRole(value)) return value
  return null
}

/** Serialize a target back to its cookie string (the inverse of `parseViewAsCookie`). */
export function serializeViewAsTarget(target: ViewAsTarget): string {
  if (typeof target === 'object') return `${ENTITY_PREFIX}${target.type}`
  return target
}

/** True when the target is the entity-role axis (the `SpaceType` preview), not the community ladder. */
export function isEntityTarget(
  target: ViewAsTarget | null,
): target is { kind: 'entity'; type: SpaceType } {
  return typeof target === 'object' && target !== null && target.kind === 'entity'
}

/** Raw target requested by the view-as cookie (not yet gated on the real role). */
export async function readViewAsTarget(): Promise<ViewAsTarget | null> {
  const value = (await cookies()).get(VIEW_AS_COOKIE)?.value
  return parseViewAsCookie(value)
}

/**
 * The effective community role for UI + authorization, given the caller's REAL
 * role. Only a real janitor may impersonate; for everyone else the real role is
 * returned unchanged. The 'visitor' preview resolves to the lowest authenticated
 * role ('member') for SERVER capability resolution — it strips every elevated
 * power and can never escalate; the visitor-only NAV gating is driven separately
 * by `viewingAsVisitor`. An ENTITY-role preview target leaves the community role
 * UNCHANGED (it is the orthogonal Space axis, resolved by routing into a Space).
 */
export async function applyViewAs(realRole: CommunityRole): Promise<CommunityRole> {
  if (!canViewAs(realRole)) return realRole
  const target = await readViewAsTarget()
  if (!target) return realRole
  // An ENTITY-role preview is the orthogonal `SpaceType` axis: it has meaning only inside a Space
  // and never alters the COMMUNITY ladder, so the real community role is returned UNCHANGED (no
  // downgrade, and crucially no escalation). The entity preview is expressed purely by routing the
  // previewer into a representative Space of that type (the selector / action), not here.
  if (isEntityTarget(target)) return realRole
  // 'visitor' strips to the lowest authenticated role for server capability resolution.
  if (target === 'visitor') return 'member'
  // Downgrade only — a target at or above the real role is ignored (never escalate).
  return roleRank(target) < roleRank(realRole) ? target : realRole
}

/** Is a steward (host+) previewing the logged-out visitor experience? Drives the
 *  visitor NAV gating (everything above visitor access mutes) + the chrome. */
export async function viewingAsVisitor(realRole: CommunityRole): Promise<boolean> {
  if (!canViewAs(realRole)) return false
  return (await readViewAsTarget()) === 'visitor'
}
