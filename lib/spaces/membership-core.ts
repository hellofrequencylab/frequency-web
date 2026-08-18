// The per-Space role LADDER — half one of lib/spaces/membership.ts, which documented itself as
// two halves and shipped as one module (LIVE-037).
//
// That header called this half "framework-independent, no Supabase/Next imports, fully unit-
// testable", and it was true of the CODE and false of the FILE: three client components importing
// SPACE_ROLES pulled the service-role admin client into the browser graph, because the server seam
// sat in the same module. Splitting at the divider the file already drew makes the claim true.
//
// Everything here is re-exported from lib/spaces/membership.ts, so every server caller is
// unchanged. CLIENT code must import from HERE.

// ── The pure role ladder (testable, no IO) ───────────────────────────────────────────────

/** A per-Space role. Ascending authority: viewer < editor < moderator < admin. Independent per
 *  Space (a person can be admin of A and viewer of B). The global staff axis (web_role) is
 *  SEPARATE and not represented here (ADR-208). */
export type SpaceRole = 'viewer' | 'editor' | 'moderator' | 'admin'

/** A membership row's lifecycle. `invited` = an outstanding invite not yet accepted; `suspended`
 *  = retained for history but excluded from authority (a removed member keeps no standing). */
export type SpaceMemberStatus = 'active' | 'invited' | 'suspended'

/** A `space_members` row as the app consumes it (camelCased; the fields callers need). */
export interface SpaceMembership {
  id: string
  spaceId: string
  profileId: string
  role: SpaceRole
  status: SpaceMemberStatus
  invitedBy: string | null
  createdAt: string
}

/** Ascending authority ladder — THE order every space-role gate ranks on; kept in lock-step with
 *  the CHECK in 20260711010000_space_members.sql. viewer(0) < editor(1) < moderator(2) < admin(3). */
export const SPACE_ROLES: readonly SpaceRole[] = ['viewer', 'editor', 'moderator', 'admin'] as const

const SPACE_MEMBER_STATUSES: readonly SpaceMemberStatus[] = ['active', 'invited', 'suspended'] as const

/** A string is a known SpaceRole (fail-closed for unknown / future enum values). */
export function isSpaceRole(v: unknown): v is SpaceRole {
  return typeof v === 'string' && (SPACE_ROLES as readonly string[]).includes(v)
}

/** A string is a known SpaceMemberStatus (fail-closed for unknowns). */
export function isSpaceMemberStatus(v: unknown): v is SpaceMemberStatus {
  return typeof v === 'string' && (SPACE_MEMBER_STATUSES as readonly string[]).includes(v)
}

/** Numeric rank of a role (0 = viewer … 3 = admin). Unknown roles rank -1 (below viewer), so any
 *  `atLeast` gate fails closed. */
export function spaceRoleRank(role: SpaceRole | string | null | undefined): number {
  return typeof role === 'string' ? (SPACE_ROLES as readonly string[]).indexOf(role) : -1
}

/** Does `role` meet or exceed the `min` rung on the ladder? The one space-role gate primitive.
 *  Fail-closed: a null/unknown role never satisfies any minimum. */
export function atLeastSpaceRole(role: SpaceRole | string | null | undefined, min: SpaceRole): boolean {
  const r = spaceRoleRank(role)
  return r >= 0 && r >= spaceRoleRank(min)
}
