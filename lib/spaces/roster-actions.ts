'use server'

// THE CLIENT-CALLABLE SERVER ACTIONS for Space roster management (Entity Management Overhaul EM2-2,
// the People slice). A 'use server' module may export ONLY async functions, so it cannot also hold the
// pure helpers (id normalization, the owner guard) or the shared types. Those live in
// lib/spaces/roster.ts (no directive: pure helpers + the gated action implementations, all
// unit-testable). This thin file is the seam the CLIENT roster surface imports, so the mutations cross
// the network boundary as proper Server Actions:
//   roster-manager.tsx -> setMemberRole, removeMember, suspendMember, reactivateMember, bulkRosterOp
//
// SERVER components (the members settings page) read the roster directly via lib/spaces/membership.ts
// (listSpaceMembers) — they never cross a client boundary, so they need no wrapper. The authorization
// (canManageMembers, re-checked per action) + validation all live in the implementations; these
// wrappers just re-expose them.

import {
  setMemberRole as setMemberRoleImpl,
  removeMember as removeMemberImpl,
  suspendMember as suspendMemberImpl,
  reactivateMember as reactivateMemberImpl,
  bulkRosterOp as bulkRosterOpImpl,
  type BulkRosterOp,
  type BulkRosterResult,
} from '@/lib/spaces/roster'
import { type SpaceRole } from '@/lib/spaces/membership'
import { type ActionResult } from '@/lib/action-result'

/** Change one member's role along the per-Space ladder. Gated on canManageMembers in the impl. */
export async function setMemberRole(
  spaceId: string,
  profileId: string,
  role: SpaceRole,
): Promise<ActionResult> {
  return setMemberRoleImpl(spaceId, profileId, role)
}

/** Remove one member from a Space. Gated on canManageMembers in the impl. */
export async function removeMember(spaceId: string, profileId: string): Promise<ActionResult> {
  return removeMemberImpl(spaceId, profileId)
}

/** Suspend one member (strip authority, keep the row). Gated on canManageMembers in the impl. */
export async function suspendMember(spaceId: string, profileId: string): Promise<ActionResult> {
  return suspendMemberImpl(spaceId, profileId)
}

/** Reactivate one suspended member. Gated on canManageMembers in the impl. */
export async function reactivateMember(spaceId: string, profileId: string): Promise<ActionResult> {
  return reactivateMemberImpl(spaceId, profileId)
}

/** Apply one operation to a multi-select of members. Gated on canManageMembers in the impl. */
export async function bulkRosterOp(
  spaceId: string,
  profileIds: string[],
  op: BulkRosterOp,
): Promise<ActionResult<BulkRosterResult>> {
  return bulkRosterOpImpl(spaceId, profileIds, op)
}
