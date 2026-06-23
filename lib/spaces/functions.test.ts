import { describe, it, expect } from 'vitest'

// Per-space-roles Phase 1 — the PURE per-Space function resolver (lib/spaces/functions.ts). Mirrors
// entitlements.test.ts: a plain object in, a boolean out. Covers the two switch kinds (entitlement-gated
// vs universal), the role thresholds, the per-Space min-role override, and every fail-safe branch (null
// role, malformed blob, unknown function).

import {
  SPACE_FUNCTIONS,
  DEFAULT_FUNCTION_ROLE,
  defaultEnabledFunctions,
  functionsForType,
  spaceFunctionDef,
  spaceFunctionEnabled,
  spaceFunctionMinRole,
  spaceFunctionMinRoleOverride,
  spaceFunctionAccess,
  isSpaceFunctionKey,
} from './functions'

describe('the registry', () => {
  it('has unique keys and a sane default role for each', () => {
    const keys = SPACE_FUNCTIONS.map((f) => f.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const fn of SPACE_FUNCTIONS) {
      expect(DEFAULT_FUNCTION_ROLE[fn.key]).toBe(fn.defaultMinRole)
    }
  })

  it('CRM and email are plan-gated; the rest are universal', () => {
    expect(spaceFunctionDef('crm')?.entitlement).toBe('crm')
    expect(spaceFunctionDef('email')?.entitlement).toBe('email')
    expect(spaceFunctionDef('members')?.entitlement).toBeNull()
    expect(spaceFunctionDef('qr')?.entitlement).toBeNull()
    expect(spaceFunctionDef('billing')?.entitlement).toBeNull()
  })

  it('isSpaceFunctionKey is fail-closed for unknowns', () => {
    expect(isSpaceFunctionKey('crm')).toBe(true)
    expect(isSpaceFunctionKey('nope')).toBe(false)
    expect(isSpaceFunctionKey(null)).toBe(false)
    expect(isSpaceFunctionKey(42)).toBe(false)
  })

  it('unknown function has no def', () => {
    expect(spaceFunctionDef('made-up')).toBeNull()
  })
})

describe('type scoping', () => {
  it('universal functions appear for every type; per-type ones only for theirs', () => {
    const practitioner = functionsForType('practitioner').map((f) => f.key)
    expect(practitioner).toContain('members') // universal
    expect(practitioner).toContain('availability') // practitioner-only
    expect(practitioner).not.toContain('memberships') // business-only
    expect(practitioner).not.toContain('tickets') // event_space-only

    const business = functionsForType('business').map((f) => f.key)
    expect(business).toContain('memberships')
    expect(business).toContain('email')
    expect(business).not.toContain('availability')

    const event = functionsForType('event_space').map((f) => f.key)
    expect(event).toContain('tickets')
    expect(event).toContain('checkin')
  })

  it('defaultEnabledFunctions returns the UNIVERSAL (free) tools for a type, not the plan-gated ones', () => {
    const business = defaultEnabledFunctions('business')
    expect(business).toContain('members')
    expect(business).toContain('qr')
    expect(business).not.toContain('crm') // plan-gated
    expect(business).not.toContain('email') // plan-gated
  })

  it('a null type offers nothing', () => {
    expect(functionsForType(null)).toEqual([])
    expect(defaultEnabledFunctions(null)).toEqual([])
  })
})

describe('the on/off switch', () => {
  it('PLAN-GATED: a function is OFF without its entitlement, ON with it (the CRM gate)', () => {
    const crm = spaceFunctionDef('crm')!
    expect(spaceFunctionEnabled({ entitlements: {} }, crm)).toBe(false)
    expect(spaceFunctionEnabled({ entitlements: { crm: true } }, crm)).toBe(true)
    expect(spaceFunctionEnabled({ entitlements: { crm: false } }, crm)).toBe(false)
    expect(spaceFunctionEnabled(null, crm)).toBe(false)
  })

  it('UNIVERSAL: default-ON; only an explicit `false` turns it off', () => {
    const members = spaceFunctionDef('members')!
    expect(spaceFunctionEnabled({ entitlements: {} }, members)).toBe(true) // empty blob = on
    expect(spaceFunctionEnabled(null, members)).toBe(true) // no space = code default (on)
    expect(spaceFunctionEnabled({ entitlements: { members: false } }, members)).toBe(false)
    expect(spaceFunctionEnabled({ entitlements: { members: true } }, members)).toBe(true)
    // A non-boolean garbage value normalizes to off (spaceEntitlements collapses non-true to false).
    expect(spaceFunctionEnabled({ entitlements: { members: 'yes' } }, members)).toBe(false)
  })
})

describe('min-role override (spaces.feature_roles)', () => {
  it('falls back to the code default when there is no override', () => {
    expect(spaceFunctionMinRole({ featureRoles: {} }, 'crm')).toBe('admin')
    expect(spaceFunctionMinRole({ featureRoles: {} }, 'members')).toBe('editor')
    expect(spaceFunctionMinRole(null, 'checkin')).toBe('moderator')
  })

  it('reads a valid override', () => {
    expect(spaceFunctionMinRoleOverride({ featureRoles: { crm: 'moderator' } }, 'crm')).toBe('moderator')
    expect(spaceFunctionMinRole({ featureRoles: { crm: 'moderator' } }, 'crm')).toBe('moderator')
  })

  it('ignores a malformed blob or an unknown role (no override -> code default)', () => {
    expect(spaceFunctionMinRoleOverride({ featureRoles: null }, 'crm')).toBeNull()
    expect(spaceFunctionMinRoleOverride({ featureRoles: 'nope' }, 'crm')).toBeNull()
    expect(spaceFunctionMinRoleOverride({ featureRoles: ['crm'] }, 'crm')).toBeNull()
    expect(spaceFunctionMinRoleOverride({ featureRoles: { crm: 'overlord' } }, 'crm')).toBeNull()
    expect(spaceFunctionMinRoleOverride({ featureRoles: { crm: 3 } }, 'crm')).toBeNull()
    // -> the resolver still answers with the code default
    expect(spaceFunctionMinRole({ featureRoles: { crm: 'overlord' } }, 'crm')).toBe('admin')
  })

  it('returns null min-role for an unknown function', () => {
    expect(spaceFunctionMinRole({ featureRoles: {} }, 'made-up')).toBeNull()
  })
})

describe('spaceFunctionAccess (the gate)', () => {
  it('PLAN-GATED + ROLE: CRM needs the entitlement AND admin by default', () => {
    const withCrm = { entitlements: { crm: true }, featureRoles: {} }
    expect(spaceFunctionAccess(withCrm, 'crm', 'admin')).toBe(true)
    expect(spaceFunctionAccess(withCrm, 'crm', 'moderator')).toBe(false) // role too low
    // Entitlement off -> no access regardless of role.
    expect(spaceFunctionAccess({ entitlements: {}, featureRoles: {} }, 'crm', 'admin')).toBe(false)
  })

  it('a per-Space override lowers the CRM bar', () => {
    const space = { entitlements: { crm: true }, featureRoles: { crm: 'moderator' } }
    expect(spaceFunctionAccess(space, 'crm', 'moderator')).toBe(true)
    expect(spaceFunctionAccess(space, 'crm', 'editor')).toBe(false) // still below moderator
  })

  it('UNIVERSAL: members is open to editor+ by default with no entitlement needed', () => {
    const plain = { entitlements: {}, featureRoles: {} }
    expect(spaceFunctionAccess(plain, 'members', 'editor')).toBe(true)
    expect(spaceFunctionAccess(plain, 'members', 'admin')).toBe(true)
    expect(spaceFunctionAccess(plain, 'members', 'viewer')).toBe(false) // below editor
  })

  it('an owner reports role "admin" and clears every default threshold', () => {
    const space = { entitlements: { crm: true, email: true }, featureRoles: {} }
    for (const fn of SPACE_FUNCTIONS) {
      // owner == 'admin'; with the entitlements granted, admin meets every default min-role.
      expect(spaceFunctionAccess(space, fn.key, 'admin')).toBe(true)
    }
  })

  it('FAIL-SAFE: null role, unknown function, and a malformed blob all deny', () => {
    const space = { entitlements: { crm: true }, featureRoles: {} }
    expect(spaceFunctionAccess(space, 'crm', null)).toBe(false)
    expect(spaceFunctionAccess(space, 'crm', undefined)).toBe(false)
    expect(spaceFunctionAccess(space, 'made-up', 'admin')).toBe(false) // unknown fn
    expect(spaceFunctionAccess(null, 'crm', 'admin')).toBe(false) // no space
    expect(spaceFunctionAccess({ entitlements: 'garbage', featureRoles: 'garbage' }, 'members', 'editor')).toBe(true)
    // ^ universal default-on survives a garbage entitlements blob (spaceEntitlements -> {}), editor meets editor.
    expect(spaceFunctionAccess({ entitlements: 'garbage', featureRoles: 'garbage' }, 'crm', 'admin')).toBe(false)
    // ^ plan-gated stays off on a garbage blob (default-deny).
  })
})
