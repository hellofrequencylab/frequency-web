import { describe, it, expect } from 'vitest'
import { canManageSpaceLoom, SPACE_LOOM_FUNCTION } from './space-loom-access'
import { spaceFunctionAccess } from '@/lib/spaces/functions'
import { SPACE_ROLES } from '@/lib/spaces/membership'

// LIVE-566 (ADR-1578): the Space Loom Studio's management door reads the Space's own `loom` function
// (the on/off switch in entitlements and the min-role bar in feature_roles) instead of canEditProfile.
// The ladder is viewer < editor < moderator < admin (lib/spaces/membership-core.ts); the code default
// bar for `loom` is editor.

const plain = { entitlements: {}, featureRoles: {} }

describe('canManageSpaceLoom (the Space Loom management door)', () => {
  it('is keyed by the loom function', () => {
    expect(SPACE_LOOM_FUNCTION).toBe('loom')
  })

  it('opens for editor and above on a plain Space (the code default bar is editor)', () => {
    expect(canManageSpaceLoom(plain, 'editor')).toBe(true)
    expect(canManageSpaceLoom(plain, 'moderator')).toBe(true)
    expect(canManageSpaceLoom(plain, 'admin')).toBe(true)
  })

  it('stays shut for a viewer and for no role at all', () => {
    expect(canManageSpaceLoom(plain, 'viewer')).toBe(false)
    expect(canManageSpaceLoom(plain, null)).toBe(false)
    expect(canManageSpaceLoom(plain, undefined)).toBe(false)
  })

  it('a Space that switched Loom Studio off shuts the door on every role, admin included', () => {
    const off = { entitlements: { loom: false }, featureRoles: {} }
    for (const role of SPACE_ROLES) expect(canManageSpaceLoom(off, role)).toBe(false)
  })

  it('a Space that raised the bar to admin shuts the door on an editor and a moderator, and keeps it open for an admin', () => {
    const raised = { entitlements: {}, featureRoles: { loom: 'admin' } }
    expect(canManageSpaceLoom(raised, 'editor')).toBe(false)
    expect(canManageSpaceLoom(raised, 'moderator')).toBe(false)
    expect(canManageSpaceLoom(raised, 'admin')).toBe(true)
  })

  it('a Space that lowered the bar to viewer lets a viewer manage', () => {
    const lowered = { entitlements: {}, featureRoles: { loom: 'viewer' } }
    expect(canManageSpaceLoom(lowered, 'viewer')).toBe(true)
    expect(canManageSpaceLoom(lowered, null)).toBe(false)
  })

  it('fails closed on a missing Space and tolerates a malformed blob (falls back to the code default)', () => {
    expect(canManageSpaceLoom(null, 'admin')).toBe(false)
    expect(canManageSpaceLoom(undefined, 'admin')).toBe(false)
    const garbage = { entitlements: {}, featureRoles: 'nope' }
    expect(canManageSpaceLoom(garbage, 'editor')).toBe(true)
    expect(canManageSpaceLoom(garbage, 'viewer')).toBe(false)
  })

  it('is exactly spaceFunctionAccess(space, "loom", role): one answer, never a second gate', () => {
    const spaces = [
      plain,
      { entitlements: { loom: false }, featureRoles: {} },
      { entitlements: {}, featureRoles: { loom: 'admin' } },
      { entitlements: {}, featureRoles: { loom: 'viewer' } },
    ]
    for (const space of spaces) {
      for (const role of [...SPACE_ROLES, null]) {
        expect(canManageSpaceLoom(space, role)).toBe(spaceFunctionAccess(space, 'loom', role))
      }
    }
  })
})
