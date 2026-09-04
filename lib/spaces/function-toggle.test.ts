import { describe, it, expect } from 'vitest'

// The pure off-switch resolver (ADR-1197). These assertions are written THROUGH the reader —
// `spaceFunctionEnabled` — rather than against the shape of the blob, because the defect this file
// fixes was precisely a blob that looked written and read back the other way. A test that asserted
// "the key was deleted" would have passed on the broken code.

import { nextEntitlementsForFunctionToggle } from './function-toggle'
import { spaceFunctionDef, SPACE_FUNCTIONS, spaceFunctionEnabled } from './functions'
import { spaceHasEntitlement, spaceBillingEntitlements, BILLING_NAMESPACE } from './entitlements'

/** Flip one function and read the result back the way production does. */
function toggle(entitlements: Record<string, unknown>, fn: string, enabled: boolean) {
  const def = spaceFunctionDef(fn)!
  const next = nextEntitlementsForFunctionToggle(entitlements, def, enabled)!
  return { next, isOn: spaceFunctionEnabled({ entitlements: next }, def) }
}

// The four whose `entitlement` is non-null. These are the four that were broken; the other 18 always
// worked. Derived, not hardcoded, so a fifth added later is covered automatically.
const GATED = SPACE_FUNCTIONS.filter((f) => f.entitlement).map((f) => f.key)

// Every function EXCEPT the one whose key collides with the reserved billing namespace. That one is
// refused outright (see the SCAN-536 block below), so it cannot take part in the ordinary sweeps.
const TOGGLEABLE = SPACE_FUNCTIONS.filter((f) => f.key !== BILLING_NAMESPACE)

describe('nextEntitlementsForFunctionToggle', () => {
  it('covers the entitlement-carrying functions the defect hit', () => {
    // Guards the derivation above: if this set empties, the tests below stop proving anything.
    expect(GATED).toEqual(expect.arrayContaining(['crm', 'email', 'shop', 'program']))
  })

  it('turns OFF every toggleable function, read back through spaceFunctionEnabled', () => {
    for (const def of TOGGLEABLE) {
      const { isOn } = toggle({}, def.key, false)
      expect({ fn: def.key, isOn }).toEqual({ fn: def.key, isOn: false })
    }
  })

  it('turns OFF a plan-gated function even on a Space whose PLAN grants it', () => {
    // The real-world case: a Business+ Space carrying billing.crm = true. Before ADR-1197 the
    // off-switch wrote the wrong key AND the union would have overridden it anyway.
    for (const fn of GATED) {
      const def = spaceFunctionDef(fn)!
      const paid = { [BILLING_NAMESPACE]: { [def.entitlement!]: true } }
      const { isOn } = toggle(paid, fn, false)
      expect({ fn, isOn }).toEqual({ fn, isOn: false })
    }
  })

  it('turns every toggleable function back ON', () => {
    for (const def of TOGGLEABLE) {
      const off = nextEntitlementsForFunctionToggle({}, def, false)!
      const { isOn } = toggle(off, def.key, true)
      expect({ fn: def.key, isOn }).toEqual({ fn: def.key, isOn: true })
    }
  })

  it('ON is stored SPARSELY for a universal function (nothing written)', () => {
    // Only the 18 functions with no entitlement are sparse. The four plan-gated ones deliberately
    // store their entitlement grant, and for crm / email / program that key IS the function key, so
    // `crm: true` is present by design: it is the janitor's absolute override, not an off-switch.
    for (const def of TOGGLEABLE.filter((f) => !f.entitlement)) {
      const off = nextEntitlementsForFunctionToggle({}, def, false)!
      const { next } = toggle(off, def.key, true)
      expect({ fn: def.key, stored: def.key in next }).toEqual({ fn: def.key, stored: false })
    }
  })

  it('where the function key and entitlement key collide, OFF survives the entitlement cleanup', () => {
    // The regression this guard exists for: crm / email / program name one string twice, so an
    // unguarded `delete next[def.entitlement]` erases the `false` written the line before and the
    // switch silently reverts to ON. Reproduced during development of this very file (ADR-1197).
    for (const def of SPACE_FUNCTIONS.filter((f) => f.entitlement === f.key)) {
      const { next, isOn } = toggle({}, def.key, false)
      expect({ fn: def.key, stored: next[def.key], isOn }).toEqual({
        fn: def.key,
        stored: false,
        isOn: false,
      })
    }
  })

  it('keeps the janitor grant absolute: enabling a plan-gated function grants its entitlement', () => {
    for (const fn of GATED) {
      const def = spaceFunctionDef(fn)!
      const { next } = toggle({}, fn, true)
      expect(spaceHasEntitlement({ entitlements: next }, def.entitlement!)).toBe(true)
    }
  })

  it('disabling drops a hand-granted entitlement so it does not outlive the switch', () => {
    const granted = nextEntitlementsForFunctionToggle({}, spaceFunctionDef('crm')!, true)!
    expect(spaceHasEntitlement({ entitlements: granted }, 'crm')).toBe(true)
    const revoked = nextEntitlementsForFunctionToggle(granted, spaceFunctionDef('crm')!, false)!
    expect(spaceHasEntitlement({ entitlements: revoked }, 'crm')).toBe(false)
  })

  it('shop writes its OFF switch on the function key, not on storefront', () => {
    // The sharpest case: shop's entitlement key is `storefront`, which the reader never consults, so
    // the old code wrote to a key with no effect on anything.
    const { next, isOn } = toggle({}, 'shop', false)
    expect(isOn).toBe(false)
    expect(next.shop).toBe(false)
    expect('storefront' in next).toBe(false)
  })

  // ── SCAN-536: the namespace collision that destroys a paid Space's grants ────────────────────
  describe('the billing function key collides with the reserved billing namespace', () => {
    const billingFn = spaceFunctionDef(BILLING_NAMESPACE)!

    it('is a real collision, not a hypothetical', () => {
      expect(billingFn).toBeTruthy()
      expect(billingFn.key).toBe(BILLING_NAMESPACE)
    })

    it('REPRODUCES the damage the unguarded write would do', () => {
      const paid = { [BILLING_NAMESPACE]: { crm: true, email: true, automation: true } }
      expect(spaceHasEntitlement({ entitlements: paid }, 'crm')).toBe(true)
      // What an ordinary off-switch write produces, and what it costs:
      const naive = { ...paid, [BILLING_NAMESPACE]: false }
      expect(spaceBillingEntitlements({ entitlements: naive })).toEqual({})
      expect(spaceHasEntitlement({ entitlements: naive }, 'crm')).toBe(false)
    })

    it('is REFUSED in both directions rather than written', () => {
      const paid = { [BILLING_NAMESPACE]: { crm: true, email: true } }
      expect(nextEntitlementsForFunctionToggle(paid, billingFn, false)).toBeNull()
      expect(nextEntitlementsForFunctionToggle(paid, billingFn, true)).toBeNull()
    })

    it('leaves the grants intact because nothing is written', () => {
      const paid = { [BILLING_NAMESPACE]: { crm: true, email: true } }
      const refused = nextEntitlementsForFunctionToggle(paid, billingFn, false)
      expect(refused).toBeNull()
      expect(spaceHasEntitlement({ entitlements: paid }, 'crm')).toBe(true)
    })
  })

  it('never mutates the blob it is given', () => {
    const before = { crm: true, [BILLING_NAMESPACE]: { email: true } }
    const snapshot = JSON.stringify(before)
    nextEntitlementsForFunctionToggle(before, spaceFunctionDef('crm')!, false)
    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('leaves every other key alone', () => {
    const before = { members: false, [BILLING_NAMESPACE]: { email: true }, 'crm.autonomy': 'safe_auto' }
    const next = nextEntitlementsForFunctionToggle(before, spaceFunctionDef('qr')!, false)!
    expect(next.members).toBe(false)
    expect(next[BILLING_NAMESPACE]).toEqual({ email: true })
    expect(next['crm.autonomy']).toBe('safe_auto')
  })
})
