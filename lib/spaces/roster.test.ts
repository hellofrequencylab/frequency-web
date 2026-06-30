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
vi.mock('./membership', async () => {
  const actual = await vi.importActual<typeof import('./membership')>('./membership')
  return { ...actual, updateSpaceMemberRole, setSpaceMemberStatus, removeSpaceMember }
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
