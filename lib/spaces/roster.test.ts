import { describe, it, expect, beforeEach, vi } from 'vitest'

// SPACE ROSTER MANAGEMENT (Entity Management Overhaul EM2-2, the People slice). What is locked here,
// all network-free (the auth + store + capability seams are mocked, the membership PRIMITIVES are
// spied):
//   1. PURE helpers are fail-closed: normalizeProfileIds drops junk / blanks / dups and caps the
//      count; isManageableTarget rejects the Space owner + blanks.
//   2. PERMISSION GATING is RE-CHECKED in every action (P5): setMemberRole / removeMember /
//      suspendMember / reactivateMember / bulkRosterOp all require canManageMembers (owner / admin).
//      An anonymous or non-manager caller is rejected and nothing is written.
//   3. OWNER PROTECTION: no action can change / remove / suspend the Space owner (the owner holds no
//      member row and is all-powerful on their own Space). A bulk op silently skips the owner.
//   4. BULK ops apply per-member with the same guard + write, and report changed vs skipped honestly.

// ── Mock the caller identity + Space resolver + capability seam (toggled per test) ──────────────
let currentProfileId: string | null = 'owner-0000-4000-a000-0000000ownr'
vi.mock('@/lib/auth', () => ({
  getMyProfileId: async () => currentProfileId,
}))

const OWNER = 'owner-0000-4000-a000-0000000ownr'
let resolvedSpace: { id: string; slug: string; ownerProfileId?: string | null } | null = {
  id: 'space-1',
  slug: 'river-studio',
  ownerProfileId: OWNER,
}
vi.mock('./store', () => ({
  getSpaceById: async () => resolvedSpace,
}))

let canManageMembers = true
vi.mock('./entitlements', () => ({
  getSpaceCapabilities: async () => ({
    isOwner: canManageMembers,
    isAdmin: canManageMembers,
    role: canManageMembers ? 'admin' : null,
    canEditProfile: canManageMembers,
    canManageMembers,
    canInvite: canManageMembers,
  }),
}))

// The membership write primitives are the seam this module gates over — spy them so we can assert
// they ARE / ARE NOT called and with what. isSpaceRole stays REAL so the unknown-role gate is real.
const { updateSpaceMemberRole, setSpaceMemberStatus, removeSpaceMember } = vi.hoisted(() => ({
  updateSpaceMemberRole: vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => true),
  setSpaceMemberStatus: vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => true),
  removeSpaceMember: vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => true),
}))
// `getSpaceMembership` is what the seat guards read to decide whether a change NEWLY consumes a
// seat, so it is a seam too: without it these tests could not tell "suspended admin" from "active
// admin", which is the entire distinction the reactivation wall turns on.
const { getSpaceMembership } = vi.hoisted(() => ({
  getSpaceMembership: vi.fn<(...args: unknown[]) => Promise<{ role: string; status: string } | null>>(
    async () => null,
  ),
}))
vi.mock('./membership', async () => {
  const actual = await vi.importActual<typeof import('./membership')>('./membership')
  return { ...actual, updateSpaceMemberRole, setSpaceMemberStatus, removeSpaceMember, getSpaceMembership }
})

// The seat wall itself. Real in production and GATED on featureGatesLive(), which is why this whole
// class of bug is latent today: the check grants everything while the gates are off. Mocking it here
// is what lets us test the behaviour that arrives when they flip, instead of shipping a guard whose
// first real exercise is in production.
let seatsAvailable = true
vi.mock('./seats', async () => {
  const actual = await vi.importActual<typeof import('./seats')>('./seats')
  return {
    ...actual,
    checkSeatForOperatorInvite: async () => ({
      allowed: seatsAvailable,
      reason: seatsAvailable ? undefined : 'This space is using all 2 of its operator seats.',
      usage: { seatQuantity: 0, base: 2, licensed: 2, used: 2, remaining: 0, full: true },
    }),
  }
})

import {
  normalizeProfileIds,
  isManageableTarget,
  setMemberRole,
  removeMember,
  suspendMember,
  reactivateMember,
  bulkRosterOp,
} from './roster'
import { isError } from '@/lib/action-result'

const ALICE = 'alice-000-4000-a000-00000000alic'
const BOB = 'bob00000-0000-4000-a000-0000000000bo'

beforeEach(() => {
  currentProfileId = OWNER
  resolvedSpace = { id: 'space-1', slug: 'river-studio', ownerProfileId: OWNER }
  canManageMembers = true
  updateSpaceMemberRole.mockClear().mockResolvedValue(true)
  setSpaceMemberStatus.mockClear().mockResolvedValue(true)
  removeSpaceMember.mockClear().mockResolvedValue(true)
  getSpaceMembership.mockClear().mockResolvedValue(null)
  seatsAvailable = true
})

describe('pure helpers (fail-closed)', () => {
  it('normalizeProfileIds keeps strings, trims, drops blanks + dups, caps the count', () => {
    expect(normalizeProfileIds([' a ', 'b', 'a', '', 'c'])).toEqual(['a', 'b', 'c'])
    expect(normalizeProfileIds('not-an-array')).toEqual([])
    expect(normalizeProfileIds([1, 2, {}, null])).toEqual([])
    expect(normalizeProfileIds(Array.from({ length: 500 }, (_, i) => `id-${i}`))).toHaveLength(200)
  })

  it('isManageableTarget rejects the owner + blanks, allows a member', () => {
    expect(isManageableTarget(ALICE, OWNER)).toBe(true)
    expect(isManageableTarget(OWNER, OWNER)).toBe(false)
    expect(isManageableTarget('', OWNER)).toBe(false)
    expect(isManageableTarget(null, OWNER)).toBe(false)
    expect(isManageableTarget(ALICE, null)).toBe(true) // no owner set -> any non-blank is manageable
  })
})

describe('setMemberRole — gated + owner-protected', () => {
  it('an owner / admin changes a member role', async () => {
    const result = await setMemberRole('space-1', ALICE, 'moderator')
    expect(isError(result)).toBe(false)
    expect(updateSpaceMemberRole).toHaveBeenCalledWith('space-1', ALICE, 'moderator')
  })

  it('a non-manager is rejected and nothing is written', async () => {
    canManageMembers = false
    const result = await setMemberRole('space-1', ALICE, 'admin')
    expect(isError(result)).toBe(true)
    expect(updateSpaceMemberRole).not.toHaveBeenCalled()
  })

  it('an anonymous caller is rejected', async () => {
    currentProfileId = null
    const result = await setMemberRole('space-1', ALICE, 'editor')
    expect(isError(result)).toBe(true)
    expect(updateSpaceMemberRole).not.toHaveBeenCalled()
  })

  it('rejects an unknown role before any write', async () => {
    const result = await setMemberRole('space-1', ALICE, 'overlord' as never)
    expect(isError(result)).toBe(true)
    expect(updateSpaceMemberRole).not.toHaveBeenCalled()
  })

  it('cannot change the role of the Space owner', async () => {
    const result = await setMemberRole('space-1', OWNER, 'viewer')
    expect(isError(result)).toBe(true)
    expect(updateSpaceMemberRole).not.toHaveBeenCalled()
  })
})

describe('removeMember / suspendMember / reactivateMember — gated + owner-protected', () => {
  it('an owner / admin removes a member', async () => {
    const result = await removeMember('space-1', ALICE)
    expect(isError(result)).toBe(false)
    expect(removeSpaceMember).toHaveBeenCalledWith('space-1', ALICE)
  })

  it('suspend flips status to suspended; reactivate flips it to active', async () => {
    await suspendMember('space-1', ALICE)
    expect(setSpaceMemberStatus).toHaveBeenCalledWith('space-1', ALICE, 'suspended')
    await reactivateMember('space-1', ALICE)
    expect(setSpaceMemberStatus).toHaveBeenCalledWith('space-1', ALICE, 'active')
  })

  it('a non-manager cannot remove / suspend', async () => {
    canManageMembers = false
    expect(isError(await removeMember('space-1', ALICE))).toBe(true)
    expect(isError(await suspendMember('space-1', ALICE))).toBe(true)
    expect(removeSpaceMember).not.toHaveBeenCalled()
    expect(setSpaceMemberStatus).not.toHaveBeenCalled()
  })

  it('cannot remove / suspend the Space owner', async () => {
    expect(isError(await removeMember('space-1', OWNER))).toBe(true)
    expect(isError(await suspendMember('space-1', OWNER))).toBe(true)
    expect(removeSpaceMember).not.toHaveBeenCalled()
    expect(setSpaceMemberStatus).not.toHaveBeenCalled()
  })

  it('reports the failure when the write fails', async () => {
    removeSpaceMember.mockResolvedValueOnce(false)
    const result = await removeMember('space-1', ALICE)
    expect(isError(result)).toBe(true)
  })
})

describe('bulkRosterOp — gated, per-member, owner-skipped, honest tally', () => {
  it('applies a role change to every selected member', async () => {
    const result = await bulkRosterOp('space-1', [ALICE, BOB], { kind: 'role', role: 'editor' })
    expect(isError(result)).toBe(false)
    if (isError(result)) return
    expect(result.data).toEqual({ changed: 2, skipped: 0 })
    expect(updateSpaceMemberRole).toHaveBeenCalledTimes(2)
    expect(updateSpaceMemberRole).toHaveBeenCalledWith('space-1', ALICE, 'editor')
    expect(updateSpaceMemberRole).toHaveBeenCalledWith('space-1', BOB, 'editor')
  })

  it('silently SKIPS the owner in a bulk selection (never acts on them)', async () => {
    const result = await bulkRosterOp('space-1', [ALICE, OWNER], { kind: 'remove' })
    expect(isError(result)).toBe(false)
    if (isError(result)) return
    expect(result.data).toEqual({ changed: 1, skipped: 1 })
    expect(removeSpaceMember).toHaveBeenCalledTimes(1)
    expect(removeSpaceMember).toHaveBeenCalledWith('space-1', ALICE)
    expect(removeSpaceMember).not.toHaveBeenCalledWith('space-1', OWNER)
  })

  it('counts a failed write as skipped (partial success reported honestly)', async () => {
    setSpaceMemberStatus.mockImplementation(async (_s: unknown, profileId: unknown) =>
      profileId === BOB ? false : true,
    )
    const result = await bulkRosterOp('space-1', [ALICE, BOB], { kind: 'suspend' })
    expect(isError(result)).toBe(false)
    if (isError(result)) return
    expect(result.data).toEqual({ changed: 1, skipped: 1 })
  })

  it('a non-manager is rejected and nothing is written', async () => {
    canManageMembers = false
    const result = await bulkRosterOp('space-1', [ALICE, BOB], { kind: 'remove' })
    expect(isError(result)).toBe(true)
    expect(removeSpaceMember).not.toHaveBeenCalled()
  })

  it('rejects an empty selection and an unknown bulk role', async () => {
    expect(isError(await bulkRosterOp('space-1', [], { kind: 'remove' }))).toBe(true)
    expect(
      isError(await bulkRosterOp('space-1', [ALICE], { kind: 'role', role: 'overlord' as never })),
    ).toBe(true)
    expect(updateSpaceMemberRole).not.toHaveBeenCalled()
  })
})


// ── The seat wall on REACTIVATION (ADR-968) ─────────────────────────────────────────────────────
// `usedSeats` counts `status = 'active'` AND a seat-consuming role, so a SUSPENDED operator consumes
// no seat. Flipping them back to active newly consumes one, which makes reactivation the same seat
// event as a promotion. It had no wall on either the single or the bulk path: an owner sitting at
// the limit could reactivate a suspended admin and end up one seat over, the exact thing
// setMemberRole already refuses.
describe('reactivateMember respects the operator seat limit', () => {
  it('refuses to bring back a suspended OPERATOR when the space is out of seats', async () => {
    getSpaceMembership.mockResolvedValue({ role: 'admin', status: 'suspended' })
    seatsAvailable = false
    const res = await reactivateMember('space-1', ALICE)
    expect(isError(res)).toBe(true)
    expect(setSpaceMemberStatus).not.toHaveBeenCalled()
  })

  it('allows it when a seat is free', async () => {
    getSpaceMembership.mockResolvedValue({ role: 'admin', status: 'suspended' })
    seatsAvailable = true
    expect(isError(await reactivateMember('space-1', ALICE))).toBe(false)
    expect(setSpaceMemberStatus).toHaveBeenCalledWith('space-1', ALICE, 'active')
  })

  it('never blocks a VIEWER, who consumes no seat at all', async () => {
    getSpaceMembership.mockResolvedValue({ role: 'viewer', status: 'suspended' })
    seatsAvailable = false
    expect(isError(await reactivateMember('space-1', ALICE))).toBe(false)
    expect(setSpaceMemberStatus).toHaveBeenCalled()
  })

  it('never blocks an ALREADY-ACTIVE member, whose seat is already counted', async () => {
    // Re-activating an active member is a no-op; charging them a second seat would be a wall that
    // fires on a change that consumes nothing.
    getSpaceMembership.mockResolvedValue({ role: 'admin', status: 'active' })
    seatsAvailable = false
    expect(isError(await reactivateMember('space-1', ALICE))).toBe(false)
    expect(setSpaceMemberStatus).toHaveBeenCalled()
  })

  it('bulk reactivation SKIPS over the wall instead of failing the batch', async () => {
    // Matches the batch's partial-success contract, and mirrors what the bulk PROMOTION path
    // already did. The two paths now share one helper so they cannot drift again.
    getSpaceMembership.mockResolvedValue({ role: 'admin', status: 'suspended' })
    seatsAvailable = false
    const res = await bulkRosterOp('space-1', [ALICE, BOB], { kind: 'reactivate' })
    expect(isError(res)).toBe(false)
    if (!isError(res)) expect(res.data).toEqual({ changed: 0, skipped: 2 })
    expect(setSpaceMemberStatus).not.toHaveBeenCalled()
  })
})
