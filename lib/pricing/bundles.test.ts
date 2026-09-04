import { describe, it, expect } from 'vitest'

// THE BUNDLE DRIFT GUARD (ADR-1196, PROG-BUNDLE).
//
// A bundle names function keys as strings. A typo, or a key retired from the registry, would silently
// switch a tool OFF for a real operator — the bundle would simply not list it, and `nextBlobsForBundle`
// would write `false`. So every key is checked against the LIVE registry rather than a copy, the same
// ratchet shape as gate-meter-drift.test.ts. The consequences are asserted through the real reader
// (`spaceFunctionEnabled`), never against the shape of the blob, because the defect this whole program
// grew out of was a blob that looked correctly written and read back the other way.

import {
  CAPABILITY_BUNDLES,
  ALL_SPACE_FUNCTION_KEYS,
  UNDISABLEABLE_FUNCTION_KEY,
  capabilityBundle,
  capabilityBundleIds,
  nextBlobsForBundle,
} from './bundles'
import { SPACE_FUNCTIONS, spaceFunctionDef, spaceFunctionEnabled } from '@/lib/spaces/functions'
import { spaceHasEntitlement, spaceBillingEntitlements, BILLING_NAMESPACE } from '@/lib/spaces/entitlements'
import { BILLING_MANAGED_KEYS } from './plans'
import { SPACE_ROLES } from '@/lib/spaces/membership-core'

describe('the bundle registry is well-formed', () => {
  it('has at least one bundle and unique ids', () => {
    expect(CAPABILITY_BUNDLES.length).toBeGreaterThan(0)
    const ids = capabilityBundleIds()
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('EVERY function key in EVERY bundle is a live registry key', () => {
    // The ratchet. A typo or a retired key means a tool silently switched off for a real operator.
    const live = new Set<string>(SPACE_FUNCTIONS.map((f) => f.key))
    const unknown: string[] = []
    for (const b of CAPABILITY_BUNDLES) {
      for (const fn of b.functions) if (!live.has(fn)) unknown.push(`${b.id} -> ${fn}`)
    }
    expect(unknown).toEqual([])
  })

  it('ALL_SPACE_FUNCTION_KEYS is derived from the registry, not a second copy of it', () => {
    expect([...ALL_SPACE_FUNCTION_KEYS].sort()).toEqual(SPACE_FUNCTIONS.map((f) => f.key).sort())
  })

  it('every bundle includes the one function that can never be switched off', () => {
    // `billing` shares its key with the reserved namespace; writing its off-switch destroys every plan
    // grant (SCAN-536). A bundle omitting it would be asking for exactly that.
    expect(spaceFunctionDef(UNDISABLEABLE_FUNCTION_KEY)).toBeTruthy()
    for (const b of CAPABILITY_BUNDLES) {
      expect({ bundle: b.id, includesBilling: b.functions.includes(UNDISABLEABLE_FUNCTION_KEY) }).toEqual(
        { bundle: b.id, includesBilling: true },
      )
    }
  })

  it('every role floor names a real function and a real role', () => {
    const live = new Set<string>(SPACE_FUNCTIONS.map((f) => f.key))
    for (const b of CAPABILITY_BUNDLES) {
      for (const [fn, role] of Object.entries(b.roleFloors ?? {})) {
        expect({ bundle: b.id, fn, known: live.has(fn) }).toEqual({ bundle: b.id, fn, known: true })
        expect(SPACE_ROLES as readonly string[]).toContain(role)
      }
    }
  })

  it('no bundle names a billing-managed entitlement key as a function', () => {
    // Bundles shape tools; they never grant paid capability. Catching the confusion here is cheaper
    // than discovering a bundle that appeared to sell something.
    const billing = new Set<string>(BILLING_MANAGED_KEYS)
    for (const b of CAPABILITY_BUNDLES) {
      for (const fn of b.functions) {
        // crm / email / program are BOTH function keys and entitlement keys; that overlap is legitimate.
        if (spaceFunctionDef(fn)) continue
        expect({ bundle: b.id, fn, isBillingKey: billing.has(fn) }).toEqual({
          bundle: b.id,
          fn,
          isBillingKey: false,
        })
      }
    }
  })
})

describe('the pass-through bundle changes nothing', () => {
  const general = capabilityBundle('general')!

  it('exists and lists every function', () => {
    expect(general).toBeTruthy()
    expect([...general.functions].sort()).toEqual([...ALL_SPACE_FUNCTION_KEYS].sort())
  })

  it('applying it to an empty Space writes no off-switch', () => {
    const { entitlements } = nextBlobsForBundle({}, {}, general)
    expect(Object.values(entitlements)).not.toContain(false)
    expect(entitlements).toEqual({})
  })

  it('applying it to a PAID Space leaves every plan grant intact', () => {
    const paid = { [BILLING_NAMESPACE]: { crm: true, email: true, automation: true, team: true } }
    const { entitlements } = nextBlobsForBundle(paid, {}, general)
    expect(spaceBillingEntitlements({ entitlements })).toEqual({
      crm: true,
      email: true,
      automation: true,
      team: true,
    })
    for (const def of SPACE_FUNCTIONS) {
      expect({ fn: def.key, on: spaceFunctionEnabled({ entitlements }, def) }).toEqual({
        fn: def.key,
        on: true,
      })
    }
  })
})

describe('nextBlobsForBundle', () => {
  /** A curated bundle built for the test only, so the assertions do not depend on shipped curation. */
  const narrow = {
    id: 'test-narrow',
    label: 'Narrow',
    tagline: 'Test fixture.',
    functions: ['profile', 'members', 'events', UNDISABLEABLE_FUNCTION_KEY] as const,
    roleFloors: { events: 'admin' } as const,
  }

  it('switches OFF every function the bundle omits, read through the real reader', () => {
    const { entitlements } = nextBlobsForBundle({}, {}, narrow)
    const on = new Set<string>(narrow.functions)
    for (const def of SPACE_FUNCTIONS) {
      const expected = on.has(def.key) || def.key === UNDISABLEABLE_FUNCTION_KEY
      expect({ fn: def.key, on: spaceFunctionEnabled({ entitlements }, def) }).toEqual({
        fn: def.key,
        on: expected,
      })
    }
  })

  it('subtracts a tool even from a Space whose PLAN pays for it', () => {
    // The reason the three-state entitlement read had to land first: without it this is inert.
    const paid = { [BILLING_NAMESPACE]: { crm: true, email: true } }
    const { entitlements } = nextBlobsForBundle(paid, {}, narrow)
    expect(spaceFunctionEnabled({ entitlements }, spaceFunctionDef('crm')!)).toBe(false)
    expect(spaceFunctionEnabled({ entitlements }, spaceFunctionDef('email')!)).toBe(false)
  })

  it('NEVER writes the reserved billing namespace, so plan grants survive', () => {
    const paid = { [BILLING_NAMESPACE]: { crm: true, email: true, automation: true } }
    const { entitlements } = nextBlobsForBundle(paid, {}, narrow)
    // The container is untouched even though `crm` and `email` were subtracted at the top level.
    expect(spaceBillingEntitlements({ entitlements })).toEqual({
      crm: true,
      email: true,
      automation: true,
    })
    expect(entitlements[BILLING_NAMESPACE]).not.toBe(false)
    // And the Plan and billing tool itself is still reachable.
    expect(spaceFunctionEnabled({ entitlements }, spaceFunctionDef(BILLING_NAMESPACE)!)).toBe(true)
  })

  it('re-applying a WIDER bundle restores what a narrower one switched off', () => {
    const general = capabilityBundle('general')!
    const narrowed = nextBlobsForBundle({}, {}, narrow)
    expect(spaceFunctionEnabled({ entitlements: narrowed.entitlements }, spaceFunctionDef('shop')!)).toBe(
      false,
    )
    const widened = nextBlobsForBundle(narrowed.entitlements, narrowed.featureRoles, general)
    for (const def of SPACE_FUNCTIONS) {
      expect({ fn: def.key, on: spaceFunctionEnabled({ entitlements: widened.entitlements }, def) }).toEqual(
        { fn: def.key, on: true },
      )
    }
  })

  it('leaves keys outside the function registry alone', () => {
    const before = { 'crm.autonomy': 'safe_auto', somethingHandSet: true }
    const { entitlements } = nextBlobsForBundle(before, {}, narrow)
    expect(entitlements['crm.autonomy']).toBe('safe_auto')
    expect(spaceHasEntitlement({ entitlements }, 'somethingHandSet')).toBe(true)
  })

  it('merges role floors without dropping existing overrides', () => {
    const { featureRoles } = nextBlobsForBundle({}, { qr: 'moderator' }, narrow)
    expect(featureRoles).toEqual({ qr: 'moderator', events: 'admin' })
  })

  it('never mutates the blobs it is given', () => {
    const ent = { [BILLING_NAMESPACE]: { crm: true } }
    const roles = { qr: 'moderator' }
    const snapshot = JSON.stringify([ent, roles])
    nextBlobsForBundle(ent, roles, narrow)
    expect(JSON.stringify([ent, roles])).toBe(snapshot)
  })
})
