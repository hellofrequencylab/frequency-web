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

export const VIEW_AS_COOKIE = 'freq-view-as'

/** The cookie prefix that marks an ENTITY preview target (a SPECIFIC Space, the separate Space
 *  axis), e.g. `entity:9f3c…`. A community-ladder target ('visitor' or a CommunityRole) carries no
 *  prefix, so the two axes can never collide in the one cookie. */
const ENTITY_PREFIX = 'entity:'

/** A plausible Space id payload for the cookie: a non-empty token of id-safe characters (uuids and
 *  slug-like ids alike), bounded so a forged value can never carry anything strange. This is only a
 *  SHAPE check — the authoritative gate (the staffer may preview THIS Space) lives in the
 *  `previewAsSpace` server action, which resolves the Space and checks the staff axis before it ever
 *  routes. */
const SPACE_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/

/** Who may use "view as": any steward Host and above. */
export function canViewAs(realRole: CommunityRole): boolean {
  return atLeastRole(realRole, 'host')
}

/**
 * A view-as target is one of two AXES (docs/NAMING.md §Roles, ADR-340):
 *  - the COMMUNITY ladder: a `CommunityRole`, or 'visitor' (the logged-out preview); resolved into
 *    an effective community role by `applyViewAs` (downgrade-only).
 *  - an ENTITY preview: `{ kind: 'entity', spaceId }` naming a SPECIFIC Space. A Space's owner
 *    experience only has meaning INSIDE that Space, so it does NOT downgrade the community role; it
 *    routes the staffer into that exact Space's owner surface (resolved by the `previewAsSpace`
 *    action), so a janitor sees precisely what that one Space sees.
 */
export type ViewAsTarget =
  | CommunityRole
  | 'visitor'
  | { kind: 'entity'; spaceId: string }

function isCommunityRole(v: string | undefined | null): v is CommunityRole {
  return !!v && (ROLE_HIERARCHY as readonly string[]).includes(v)
}

/** The raw cookie value (a string) parsed into a target, or null when it is not a recognized one.
 *  An `entity:<spaceId>` value is accepted only when the payload is a SHAPE-valid Space id; the
 *  authoritative check (the staffer may preview THIS Space) is the `previewAsSpace` action, which
 *  is the only writer of this cookie value. */
export function parseViewAsCookie(value: string | undefined | null): ViewAsTarget | null {
  if (!value) return null
  if (value.startsWith(ENTITY_PREFIX)) {
    const spaceId = value.slice(ENTITY_PREFIX.length)
    return SPACE_ID_RE.test(spaceId) ? { kind: 'entity', spaceId } : null
  }
  if (value === 'visitor' || isCommunityRole(value)) return value
  return null
}

/** Serialize a target back to its cookie string (the inverse of `parseViewAsCookie`). */
export function serializeViewAsTarget(target: ViewAsTarget): string {
  if (typeof target === 'object') return `${ENTITY_PREFIX}${target.spaceId}`
  return target
}

/** True when the target is the entity axis (a specific-Space preview), not the community ladder. */
export function isEntityTarget(
  target: ViewAsTarget | null,
): target is { kind: 'entity'; spaceId: string } {
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
 * by `viewingAsVisitor`. An ENTITY preview target (a specific Space) leaves the
 * community role UNCHANGED (it is the orthogonal Space axis, resolved by routing
 * into that one Space's owner surface).
 */
export async function applyViewAs(realRole: CommunityRole): Promise<CommunityRole> {
  if (!canViewAs(realRole)) return realRole
  const target = await readViewAsTarget()
  if (!target) return realRole
  // An ENTITY preview is the orthogonal Space axis: it names a specific Space, has meaning only
  // inside that Space, and never alters the COMMUNITY ladder, so the real community role is returned
  // UNCHANGED (no downgrade, and crucially no escalation). The entity preview is expressed purely by
  // routing the staffer into that Space's owner surface (the `previewAsSpace` action), not here.
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
