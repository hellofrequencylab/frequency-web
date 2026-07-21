// SPACE ROSTER MANAGEMENT — the People module for a Space (Entity Management Overhaul EM2-2, the
// People slice; ENTITY-SPACES-SYSTEM §3.2, the team layer). The gated server actions an owner /
// admin uses to manage who is on a Space and the role each one holds: change a member's role along
// the per-Space ladder, remove a member, suspend / reactivate a member, and the BULK variants
// (multi-select role change / removal / suspend).
//
// SHAPE (mirrors lib/spaces/invites.ts): the PURE helpers (id-list normalization, the
// owner-protection guard, the assignable-role gate) have no Supabase/Next imports, so they are fully
// unit-testable (lib/spaces/roster.test.ts). The membership PRIMITIVES they call (updateSpaceMember
// Role / setSpaceMemberStatus / removeSpaceMember) live in lib/spaces/membership.ts; this module is
// the AUTHORIZATION seam over them. It has NO 'use server' directive (so it can ALSO export the pure
// helpers + the action implementations the test imports). The thin 'use server' wrappers the CLIENT
// roster surface calls live in lib/spaces/roster-actions.ts.
//
// AUTHORITY (P5 — the server is the authority for every gate, RE-CHECKED in every action, not just on
// the page): every action re-resolves getSpaceCapabilities for the CALLER on the TARGET Space and
// requires canManageMembers (owner / admin). A non-manager, an anonymous caller, or a missing Space is
// rejected fail-closed; nothing is written. The Space OWNER (spaces.owner_profile_id) holds no
// space_members row and is all-powerful on their own Space, so an owner is NEVER a valid target — the
// guard rejects acting on the owner's profile id, so ownership can never be removed or downgraded
// here (ownership transfer is the platform-admin lifecycle surface, EM1-6, out of this slice).
//
// SCOPE NOTE: this slice is Spaces-only (practitioner + organization priority). The cross-entity
// generalization (one roster module for circle / hub / nexus / event) is a later slice (EM1-5); this
// owns the Space People module against the existing space_members ladder, no schema change.

import { getMyProfileId } from '@/lib/auth'
import { getSpaceById } from '@/lib/spaces/store'
import { getSpaceCapabilities } from '@/lib/spaces/entitlements'
import {
  isSpaceRole,
  getSpaceMembership,
  updateSpaceMemberRole,
  setSpaceMemberStatus,
  removeSpaceMember,
  type SpaceRole,
} from '@/lib/spaces/membership'
import { checkSeatForOperatorInvite, operatorRoleConsumesSeat } from '@/lib/spaces/seats'
import { type ActionResult, ok, fail } from '@/lib/action-result'

// A hard cap on a bulk operation so a malformed / hostile selection can never fan out an unbounded
// number of writes in one action.
const MAX_BULK = 200

// ── PURE: validation + the owner-protection guard (no IO, fully testable) ───────────────────────

/** Coerce a raw value to a clean, de-duped list of profile ids: keeps non-empty strings, trims,
 *  drops blanks + duplicates, caps the count. Anything non-array (or non-string entries) yields []
 *  (fail-closed — a malformed selection acts on no one). Pure. */
export function normalizeProfileIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const id = item.trim()
    if (id) seen.add(id)
    if (seen.size >= MAX_BULK) break
  }
  return [...seen]
}

/** Whether `profileId` is a valid TARGET to manage on a Space owned by `ownerProfileId`. The Space
 *  owner is never a manageable target (they hold no member row and are all-powerful on their own
 *  Space, so a role-change / remove / suspend can never touch ownership). A blank id is also invalid.
 *  Pure + fail-closed. */
export function isManageableTarget(
  profileId: string | null | undefined,
  ownerProfileId: string | null | undefined,
): boolean {
  if (typeof profileId !== 'string' || !profileId.trim()) return false
  return !ownerProfileId || profileId !== ownerProfileId
}

// ── The shared gate: resolve the caller's manage authority on a Space ────────────────────────────

/** Re-resolve the caller's manage authority on a Space (P5 — every action gates here, never trusts
 *  the page). Returns the resolved Space + the caller's profile id on success, or an ActionResult
 *  error to return directly. Fail-closed: an anonymous caller, a missing Space, or a caller without
 *  canManageMembers (owner / admin) is rejected and nothing downstream runs. */
async function requireManager(
  spaceId: string,
): Promise<{ ownerProfileId: string | null; callerId: string } | { error: string }> {
  const callerId = await getMyProfileId()
  if (!callerId) return { error: 'Sign in to manage members.' }

  const space = await getSpaceById(spaceId)
  if (!space) return { error: 'Space not found.' }

  const caps = await getSpaceCapabilities(space, callerId)
  if (!caps.canManageMembers)
    return { error: 'You do not have permission to manage members for this space.' }

  return { ownerProfileId: space.ownerProfileId ?? null, callerId }
}

// ── PUBLIC SERVER ACTIONS (all gated / validated server-side) ───────────────────────────────────

/**
 * Change ONE member's role along the per-Space ladder (viewer / editor / moderator / admin). Gated on
 * canManageMembers (owner / admin), re-checked here. Rejects an unknown role and rejects targeting the
 * Space owner (ownership is not a member role). Returns ActionResult. Fail-closed on permission.
 */
export async function setMemberRole(
  spaceId: string,
  profileId: string,
  role: SpaceRole,
): Promise<ActionResult> {
  const gate = await requireManager(spaceId)
  if ('error' in gate) return fail(gate.error)

  if (!isSpaceRole(role)) return fail('Pick a role from the list.')
  if (!isManageableTarget(profileId, gate.ownerProfileId))
    return fail('You cannot change the role of the space owner.')

  // SEAT-LIMIT ENFORCEMENT (Phase D, ADR-465). PROMOTING a member into an operator role (editor /
  // moderator / admin) consumes a seat, exactly like inviting one, so it is gated the same way. Only a
  // change that NEWLY consumes a seat is checked: a member already counted as an active operator is
  // already in usedSeats, so a lateral operator-to-operator change (e.g. editor -> admin) is free and
  // must not falsely trip the wall. GATED on billingLive() (grant-all while OFF); demotions and
  // viewer changes consume no seat, so they always pass.
  if (operatorRoleConsumesSeat(role)) {
    const current = await getSpaceMembership(spaceId, profileId)
    const alreadyCountedOperator = current?.status === 'active' && operatorRoleConsumesSeat(current.role)
    if (!alreadyCountedOperator) {
      const seatCheck = await checkSeatForOperatorInvite(spaceId, role)
      if (!seatCheck.allowed)
        return fail(seatCheck.reason ?? 'This space has no operator seats left. Add a seat to promote this member.')
    }
  }

  const okWrite = await updateSpaceMemberRole(spaceId, profileId, role)
  return okWrite ? ok() : fail('Could not change the role. Try again.')
}

/**
 * Remove ONE member from a Space (a hard delete of their membership row). Gated on canManageMembers,
 * re-checked here. Rejects targeting the Space owner (ownership cannot be removed here). Returns
 * ActionResult. Fail-closed on permission.
 */
export async function removeMember(spaceId: string, profileId: string): Promise<ActionResult> {
  const gate = await requireManager(spaceId)
  if ('error' in gate) return fail(gate.error)

  if (!isManageableTarget(profileId, gate.ownerProfileId))
    return fail('You cannot remove the space owner.')

  const okWrite = await removeSpaceMember(spaceId, profileId)
  return okWrite ? ok() : fail('Could not remove the member. Try again.')
}

/**
 * Suspend ONE member: keep their row for history but strip their authority (a suspended membership
 * confers no role, see getSpaceCapabilities). Gated on canManageMembers, re-checked here. Rejects
 * targeting the Space owner. Returns ActionResult. Fail-closed on permission.
 */
export async function suspendMember(spaceId: string, profileId: string): Promise<ActionResult> {
  const gate = await requireManager(spaceId)
  if ('error' in gate) return fail(gate.error)

  if (!isManageableTarget(profileId, gate.ownerProfileId))
    return fail('You cannot suspend the space owner.')

  const okWrite = await setSpaceMemberStatus(spaceId, profileId, 'suspended')
  return okWrite ? ok() : fail('Could not suspend the member. Try again.')
}

/**
 * Reactivate ONE suspended member (flip their status back to active, restoring their role's
 * authority). Gated on canManageMembers, re-checked here. Rejects targeting the Space owner. Returns
 * ActionResult. Fail-closed on permission.
 */
export async function reactivateMember(spaceId: string, profileId: string): Promise<ActionResult> {
  const gate = await requireManager(spaceId)
  if ('error' in gate) return fail(gate.error)

  if (!isManageableTarget(profileId, gate.ownerProfileId))
    return fail('You cannot change the space owner.')

  const okWrite = await setSpaceMemberStatus(spaceId, profileId, 'active')
  return okWrite ? ok() : fail('Could not reactivate the member. Try again.')
}

/** The bulk operations a multi-select supports: change role, remove, suspend, or reactivate. */
export type BulkRosterOp =
  | { kind: 'role'; role: SpaceRole }
  | { kind: 'remove' }
  | { kind: 'suspend' }
  | { kind: 'reactivate' }

/** The outcome of a bulk operation: how many of the selected members it changed, and how many were
 *  skipped (the owner, or a write that failed). */
export interface BulkRosterResult {
  changed: number
  skipped: number
}

/**
 * Apply one operation to a MULTI-SELECT of members in a single Space (the bulk ops the roster's
 * multi-select offers). Gated ONCE on canManageMembers (the caller's authority is the same for the
 * whole Space), re-checked here; then each selected member is processed with the SAME owner-protection
 * + write the single-member actions use, so a bulk op can never do what a single op cannot. The Space
 * owner is silently skipped (counted in `skipped`), never acted on. An unknown role on a bulk role
 * change is rejected up front (nothing is written). Returns a per-batch tally; partial success is
 * reported honestly (changed vs skipped). Fail-closed on permission.
 */
export async function bulkRosterOp(
  spaceId: string,
  profileIds: string[],
  op: BulkRosterOp,
): Promise<ActionResult<BulkRosterResult>> {
  const gate = await requireManager(spaceId)
  if ('error' in gate) return fail(gate.error)

  if (op.kind === 'role' && !isSpaceRole(op.role)) return fail('Pick a role from the list.')

  const ids = normalizeProfileIds(profileIds)
  if (ids.length === 0) return fail('Select at least one member.')

  let changed = 0
  let skipped = 0
  for (const profileId of ids) {
    // Apply the SAME owner-protection guard the single-member actions use: the owner is never a valid
    // target, so a bulk op silently skips them rather than failing the whole batch.
    if (!isManageableTarget(profileId, gate.ownerProfileId)) {
      skipped += 1
      continue
    }
    let okWrite = false
    switch (op.kind) {
      case 'role': {
        // SEAT-LIMIT ENFORCEMENT (ADR-465): a bulk promotion consumes a seat exactly like a single one,
        // so it is gated identically — otherwise an owner could multi-select past their licensed seats,
        // the one thing setMemberRole already prevents. Only a NEWLY seat-consuming change is checked (a
        // member already an active operator is already counted). Writes are sequential, so each check
        // sees the prior grants in this batch. A member who would exceed the limit is skipped, not
        // failed, matching the batch's partial-success contract. GATED on billingLive() inside the check.
        if (operatorRoleConsumesSeat(op.role)) {
          const current = await getSpaceMembership(spaceId, profileId)
          const alreadyCountedOperator =
            current?.status === 'active' && operatorRoleConsumesSeat(current.role)
          if (!alreadyCountedOperator) {
            const seatCheck = await checkSeatForOperatorInvite(spaceId, op.role)
            if (!seatCheck.allowed) {
              skipped += 1
              continue
            }
          }
        }
        okWrite = await updateSpaceMemberRole(spaceId, profileId, op.role)
        break
      }
      case 'remove':
        okWrite = await removeSpaceMember(spaceId, profileId)
        break
      case 'suspend':
        okWrite = await setSpaceMemberStatus(spaceId, profileId, 'suspended')
        break
      case 'reactivate':
        okWrite = await setSpaceMemberStatus(spaceId, profileId, 'active')
        break
    }
    if (okWrite) changed += 1
    else skipped += 1
  }

  return ok({ changed, skipped })
}
