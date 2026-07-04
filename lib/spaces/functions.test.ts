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

  it('CRM and email carry a freemium TIER key; the rest carry none (all are universally available)', () => {
    // ADR-517 Phase F: the `entitlement` value is now only the Phase-G tier key, NOT a pure on/off gate.
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

describe('type scoping (UNIVERSAL — ADR-517 Phase F)', () => {
  it('EVERY function applies to EVERY type: every profile is the same functionally', () => {
    const allKeys = SPACE_FUNCTIONS.map((f) => f.key)
    for (const type of ['practitioner', 'business', 'organization', 'event_space', 'coaching', 'lab', 'partner'] as const) {
      const keys = functionsForType(type).map((f) => f.key)
      expect(keys).toEqual(allKeys) // full registry, no per-type restriction
    }
  })

  it('defaultEnabledFunctions returns the non-tier (free) tools for a type, excluding the tier-marked ones', () => {
    const business = defaultEnabledFunctions('business')
    expect(business).toContain('members')
    expect(business).toContain('qr')
    // A business now also offers what were once type-specific tools (universal).
    expect(business).toContain('availability')
    expect(business).toContain('tickets')
    // crm/email carry a tier key, so the seeder never writes them here.
    expect(business).not.toContain('crm')
    expect(business).not.toContain('email')
  })

  it('a null type offers nothing', () => {
    expect(functionsForType(null)).toEqual([])
    expect(defaultEnabledFunctions(null)).toEqual([])
  })
})

describe('the on/off switch (UNIVERSAL default-ON — ADR-517 Phase F)', () => {
  it('a TIER-MARKED function (crm) is now default-ON like the rest; only an explicit `false` turns it off', () => {
    const crm = spaceFunctionDef('crm')!
    expect(spaceFunctionEnabled({ entitlements: {} }, crm)).toBe(true) // universal default-ON (was OFF)
    expect(spaceFunctionEnabled({ entitlements: { crm: true } }, crm)).toBe(true)
    expect(spaceFunctionEnabled({ entitlements: { crm: false } }, crm)).toBe(false) // explicit off
    expect(spaceFunctionEnabled(null, crm)).toBe(true) // no space = code default (on)
  })

  it('a non-tier function (members) is default-ON; only an explicit `false` turns it off', () => {
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

describe('spaceFunctionAccess (the gate — UNIVERSAL, ADR-517 Phase F)', () => {
  it('CRM is available by default (no entitlement needed) and still gated by ROLE (admin default)', () => {
    const plain = { entitlements: {}, featureRoles: {} }
    expect(spaceFunctionAccess(plain, 'crm', 'admin')).toBe(true) // universal: on with no entitlement
    expect(spaceFunctionAccess(plain, 'crm', 'moderator')).toBe(false) // role too low
    // An explicit `false` turns it off even for an admin (operator disabled the tool).
    expect(spaceFunctionAccess({ entitlements: { crm: false }, featureRoles: {} }, 'crm', 'admin')).toBe(false)
  })

  it('a per-Space override lowers the CRM bar', () => {
    const space = { entitlements: {}, featureRoles: { crm: 'moderator' } }
    expect(spaceFunctionAccess(space, 'crm', 'moderator')).toBe(true)
    expect(spaceFunctionAccess(space, 'crm', 'editor')).toBe(false) // still below moderator
  })

  it('members is open to editor+ by default', () => {
    const plain = { entitlements: {}, featureRoles: {} }
    expect(spaceFunctionAccess(plain, 'members', 'editor')).toBe(true)
    expect(spaceFunctionAccess(plain, 'members', 'admin')).toBe(true)
    expect(spaceFunctionAccess(plain, 'members', 'viewer')).toBe(false) // below editor
  })

  it('an owner (role "admin") of a plain Space clears EVERY function — the full universal set', () => {
    // The core Phase F guarantee: a manager of ANY Space, with NOTHING granted, reaches every function.
    const plain = { entitlements: {}, featureRoles: {} }
    for (const fn of SPACE_FUNCTIONS) {
      expect(spaceFunctionAccess(plain, fn.key, 'admin')).toBe(true)
    }
  })

  it('FAIL-SAFE: null/unknown role and unknown function deny; a garbage blob defaults to ON (never a lockout)', () => {
    const plain = { entitlements: {}, featureRoles: {} }
    expect(spaceFunctionAccess(plain, 'crm', null)).toBe(false) // null role
    expect(spaceFunctionAccess(plain, 'crm', undefined)).toBe(false)
    expect(spaceFunctionAccess(plain, 'made-up', 'admin')).toBe(false) // unknown fn
    // Universal default-ON survives a garbage entitlements blob (spaceEntitlements -> {}).
    expect(spaceFunctionAccess({ entitlements: 'garbage', featureRoles: 'garbage' }, 'members', 'editor')).toBe(true)
    expect(spaceFunctionAccess({ entitlements: 'garbage', featureRoles: 'garbage' }, 'crm', 'admin')).toBe(true)
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
