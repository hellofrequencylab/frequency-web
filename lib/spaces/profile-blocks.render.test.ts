import { describe, it, expect } from 'vitest'

// The PURE module-engine resolver (lib/spaces/profile-modules.ts): the function set a space offers +
// has on, and the ordered ProfileBlockId layout that derives from it. Plain objects in, a Set / an
// ordered id list out — no React, no IO. Locks the compose of the S1 registry over the live function
// gates (the one bit of real logic the non-Puck renderer runs before it fetches anything).

import { enabledFunctionKeys, resolveProfileLayout } from './profile-modules'

describe('enabledFunctionKeys', () => {
  it('turns EVERY function ON by default under universal functions (ADR-517 Phase F, empty blob)', () => {
    const keys = enabledFunctionKeys({ type: 'business', entitlements: {} })
    expect(keys.has('members')).toBe(true)
    expect(keys.has('availability')).toBe(true)
    expect(keys.has('profile')).toBe(true)
    // crm/email are now universally available too (their entitlement value is only the Phase-G tier key).
    expect(keys.has('crm')).toBe(true)
    expect(keys.has('email')).toBe(true)
  })

  it('drops a function the operator explicitly turned OFF', () => {
    const keys = enabledFunctionKeys({ type: 'business', entitlements: { members: false } })
    expect(keys.has('members')).toBe(false)
    expect(keys.has('availability')).toBe(true)
  })

  it('offers every function on every type (no per-type restriction under universal functions)', () => {
    // A business now offers availability, tickets, donations, etc. — every profile is the same functionally.
    const keys = enabledFunctionKeys({ type: 'business', entitlements: {} })
    expect(keys.has('availability')).toBe(true)
    expect(keys.has('tickets')).toBe(true)
    expect(keys.has('donations')).toBe(true)
  })

  it('is fail-safe on a malformed entitlements blob (universals stay on)', () => {
    const keys = enabledFunctionKeys({ type: 'business', entitlements: 'nonsense' })
    expect(keys.has('members')).toBe(true)
  })
})

describe('resolveProfileLayout', () => {
  it('includes booking + team for a practitioner with availability + members on', () => {
    const layout = resolveProfileLayout({ type: 'business', entitlements: {} })
    expect(layout).toContain('about')
    expect(layout).toContain('booking')
    expect(layout).toContain('team')
    // Order follows the registry `order` field: about before booking before team.
    expect(layout.indexOf('about')).toBeLessThan(layout.indexOf('booking'))
    expect(layout.indexOf('booking')).toBeLessThan(layout.indexOf('team'))
  })

  it('gates booking by the availability function, not the space type', () => {
    // Under universal functions a nonprofit offers availability, so booking appears; turning the function
    // OFF drops it. Type never gates the block set (the per-type gate was retired for grid uniformity).
    expect(resolveProfileLayout({ type: 'nonprofit', entitlements: {} })).toContain('booking')
    expect(
      resolveProfileLayout({ type: 'nonprofit', entitlements: { availability: false } }),
    ).not.toContain('booking')
    // A nonprofit space still offers members-gated team.
    expect(resolveProfileLayout({ type: 'nonprofit', entitlements: {} })).toContain('team')
  })

  it('omits team when the members function is turned off', () => {
    const layout = resolveProfileLayout({ type: 'business', entitlements: { members: false } })
    expect(layout).not.toContain('team')
    expect(layout).toContain('booking')
  })

  it('includes the universal business block regardless of type (per-type gate retired)', () => {
    expect(resolveProfileLayout({ type: 'business', entitlements: {} })).toContain('business')
    expect(resolveProfileLayout({ type: 'nonprofit', entitlements: {} })).toContain('business')
  })
})
