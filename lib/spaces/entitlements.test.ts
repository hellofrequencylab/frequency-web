import { describe, it, expect } from 'vitest'

// Phase 0 (ENTITY-SPACES-BUILD §0, Epic 0.1) — ENTITLEMENTS default-deny + the owner/role
// CAPABILITY set. These are the pure halves (no IO); the IO entry point getSpaceCapabilities is
// covered for its owner path here and exercised against the membership seam in membership.test.ts.

import {
  spaceEntitlements,
  spaceHasEntitlement,
  spaceCapabilitiesFor,
  isSpaceAdmin,
  type SpaceLike,
} from './entitlements'

describe('entitlements (DEFAULT-DENY)', () => {
  it('reads explicit grants', () => {
    const space: SpaceLike = { entitlements: { crm: true, email: true, gamification: false } }
    expect(spaceEntitlements(space)).toEqual({ crm: true, email: true, gamification: false })
    expect(spaceHasEntitlement(space, 'crm')).toBe(true)
    expect(spaceHasEntitlement(space, 'email')).toBe(true)
  })

  it('DEFAULT-DENY: a missing key is off', () => {
    const space: SpaceLike = { entitlements: { crm: true } }
    expect(spaceHasEntitlement(space, 'email')).toBe(false)
    expect(spaceHasEntitlement(space, 'white_label')).toBe(false)
  })

  it('DEFAULT-DENY: a non-true value is off (only `true` grants)', () => {
    const space: SpaceLike = { entitlements: { crm: 'yes', email: 1, sms: false, push: null } }
    expect(spaceHasEntitlement(space, 'crm')).toBe(false)
    expect(spaceHasEntitlement(space, 'email')).toBe(false)
    expect(spaceHasEntitlement(space, 'sms')).toBe(false)
    expect(spaceHasEntitlement(space, 'push')).toBe(false)
  })

  it('DEFAULT-DENY: a missing / malformed / null blob grants nothing', () => {
    expect(spaceEntitlements(null)).toEqual({})
    expect(spaceEntitlements(undefined)).toEqual({})
    expect(spaceEntitlements({})).toEqual({})
    expect(spaceEntitlements({ entitlements: undefined })).toEqual({})
    expect(spaceEntitlements({ entitlements: 'not-an-object' })).toEqual({})
    expect(spaceEntitlements({ entitlements: ['crm'] })).toEqual({}) // arrays are not maps
    expect(spaceHasEntitlement({ entitlements: null }, 'crm')).toBe(false)
  })
})

describe('capabilities (owner + member role)', () => {
  it('owner is admin-equivalent and can do everything', () => {
    const caps = spaceCapabilitiesFor(true, null)
    expect(caps).toMatchObject({
      isOwner: true,
      isAdmin: true,
      role: 'admin',
      canEditProfile: true,
      canManageMembers: true,
      canInvite: true,
    })
  })

  it('admin member (not owner) can manage members + invite + edit', () => {
    const caps = spaceCapabilitiesFor(false, 'admin')
    expect(caps).toMatchObject({ isOwner: false, isAdmin: true, canManageMembers: true, canInvite: true, canEditProfile: true })
  })

  it('moderator can invite + edit but NOT manage members', () => {
    const caps = spaceCapabilitiesFor(false, 'moderator')
    expect(caps.isAdmin).toBe(false)
    expect(caps.canManageMembers).toBe(false)
    expect(caps.canInvite).toBe(true)
    expect(caps.canEditProfile).toBe(true)
  })

  it('editor can edit but cannot invite or manage', () => {
    const caps = spaceCapabilitiesFor(false, 'editor')
    expect(caps.canEditProfile).toBe(true)
    expect(caps.canInvite).toBe(false)
    expect(caps.canManageMembers).toBe(false)
  })

  it('viewer can do none of the operator actions', () => {
    const caps = spaceCapabilitiesFor(false, 'viewer')
    expect(caps.canEditProfile).toBe(false)
    expect(caps.canInvite).toBe(false)
    expect(caps.canManageMembers).toBe(false)
    expect(caps.isAdmin).toBe(false)
  })

  it('no role (stranger) gets nothing', () => {
    const caps = spaceCapabilitiesFor(false, null)
    expect(caps).toMatchObject({ isOwner: false, isAdmin: false, role: null, canEditProfile: false, canManageMembers: false, canInvite: false })
  })
})

describe('isSpaceAdmin (owner-or-admin)', () => {
  const space: SpaceLike = { id: 's1', ownerProfileId: 'owner-1' }
  it('the owner is a space admin', () => {
    expect(isSpaceAdmin(space, 'owner-1')).toBe(true)
  })
  it('an admin member is a space admin', () => {
    expect(isSpaceAdmin(space, 'someone-else', 'admin')).toBe(true)
  })
  it('a non-owner non-admin is not', () => {
    expect(isSpaceAdmin(space, 'someone-else', 'moderator')).toBe(false)
    expect(isSpaceAdmin(space, 'someone-else', null)).toBe(false)
  })
  it('anonymous is never admin', () => {
    expect(isSpaceAdmin(space, null)).toBe(false)
    expect(isSpaceAdmin(space, undefined)).toBe(false)
  })
})
