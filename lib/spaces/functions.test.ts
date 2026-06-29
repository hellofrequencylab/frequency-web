import { describe, it, expect } from 'vitest'

// Per-space-roles Phase 1 — the PURE per-Space function resolver (lib/spaces/functions.ts). Mirrors
// entitlements.test.ts: a plain object in, a boolean out. Covers the two switch kinds (entitlement-gated
// vs universal), the role thresholds, the per-Space min-role override, and every fail-safe branch (null
// role, malformed blob, unknown function).

import {
  SPACE_FUNCTIONS,
  SPACE_TYPES,
  DEFAULT_FUNCTION_ROLE,
  defaultEnabledFunctions,
  functionsForType,
  spaceFunctionDef,
  spaceFunctionEnabled,
  spaceFunctionMinRole,
  spaceFunctionMinRoleOverride,
  spaceFunctionAccess,
  isSpaceFunctionKey,
  isSpaceType,
  seedSpaceConfigFromDefaults,
  type SpaceFunctionTypeDefault,
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

describe('SpaceType guard (Phase 2)', () => {
  it('SPACE_TYPES carries the member-facing + platform types and isSpaceType fails closed', () => {
    expect(SPACE_TYPES).toContain('practitioner')
    expect(SPACE_TYPES).toContain('event_space')
    expect(SPACE_TYPES).toContain('root')
    expect(isSpaceType('business')).toBe(true)
    expect(isSpaceType('made-up')).toBe(false)
    expect(isSpaceType(null)).toBe(false)
    expect(isSpaceType(42)).toBe(false)
  })
})

describe('seedSpaceConfigFromDefaults (Phase 2 type-defaults resolution)', () => {
  it('no defaults -> empty blobs (a new space resolves to pure code defaults, today exactly)', () => {
    const seed = seedSpaceConfigFromDefaults('business', [])
    expect(seed.entitlements).toEqual({})
    expect(seed.featureRoles).toEqual({})
  })

  it('a null type -> empty blobs', () => {
    expect(seedSpaceConfigFromDefaults(null, [])).toEqual({ entitlements: {}, featureRoles: {} })
  })

  it('a min-role override that DIFFERS from the code default is written; a matching one is not', () => {
    const defaults: SpaceFunctionTypeDefault[] = [
      { type: 'business', fn: 'members', enabled: true, minRole: 'admin' }, // members default is editor -> write
      { type: 'business', fn: 'qr', enabled: true, minRole: 'editor' }, // qr default is editor -> sparse, no write
    ]
    const seed = seedSpaceConfigFromDefaults('business', defaults)
    expect(seed.featureRoles).toEqual({ members: 'admin' })
    expect(seed.entitlements).toEqual({}) // both still enabled -> nothing sparse to write
  })

  it('a UNIVERSAL function turned OFF writes the sparse false; default-ON writes nothing', () => {
    const defaults: SpaceFunctionTypeDefault[] = [
      { type: 'business', fn: 'qr', enabled: false, minRole: 'editor' }, // off -> write false
    ]
    const seed = seedSpaceConfigFromDefaults('business', defaults)
    expect(seed.entitlements).toEqual({ qr: false })
    expect(seed.featureRoles).toEqual({}) // role matches code default -> sparse
  })

  it('PLAN-GATED functions are never seeded ON (a new space starts on the free plan)', () => {
    const defaults: SpaceFunctionTypeDefault[] = [
      // Even if an operator marks crm/email enabled at the type level, the seed never grants the plan.
      { type: 'business', fn: 'crm', enabled: true, minRole: 'admin' },
      { type: 'business', fn: 'email', enabled: true, minRole: 'admin' },
    ]
    const seed = seedSpaceConfigFromDefaults('business', defaults)
    expect(seed.entitlements.crm).toBeUndefined()
    expect(seed.entitlements.email).toBeUndefined()
  })

  it('ignores rows for OTHER types and unknown function keys', () => {
    const defaults = [
      { type: 'practitioner', fn: 'availability', enabled: true, minRole: 'admin' }, // other type -> ignored for business
      { type: 'business', fn: 'made-up', enabled: false, minRole: 'admin' }, // unknown fn -> ignored
    ] as unknown as SpaceFunctionTypeDefault[]
    const seed = seedSpaceConfigFromDefaults('business', defaults)
    expect(seed.entitlements).toEqual({})
    expect(seed.featureRoles).toEqual({})
  })

  it('the seeded config, read back through the resolver, reproduces the operator intent', () => {
    // An operator sets business `members` to admin and turns `qr` off. A new business space seeded from
    // that should: deny an editor on members (now admin-only) and deny everyone on qr (off).
    const defaults: SpaceFunctionTypeDefault[] = [
      { type: 'business', fn: 'members', enabled: true, minRole: 'admin' },
      { type: 'business', fn: 'qr', enabled: false, minRole: 'editor' },
    ]
    const seed = seedSpaceConfigFromDefaults('business', defaults)
    const space = { entitlements: seed.entitlements, featureRoles: seed.featureRoles }
    expect(spaceFunctionAccess(space, 'members', 'editor')).toBe(false) // raised to admin
    expect(spaceFunctionAccess(space, 'members', 'admin')).toBe(true)
    expect(spaceFunctionAccess(space, 'qr', 'admin')).toBe(false) // turned off entirely
  })
})
