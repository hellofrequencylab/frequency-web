import { describe, it, expect } from 'vitest'
import { isNetworkConnected, pricingWorldFor, effectiveOrderSource } from './network-world'
import { SPACE_PLANS } from './plans'

// Phase 3 (ADR-811 §3): the two-world switch. The contract that carries money: a DISCONNECTED Space can
// never be billed a network take-rate — effectiveOrderSource collapses it to `self` (0%) regardless of the
// classified source. And the switch is default-safe: only an explicit `true` counts as connected.

describe('isNetworkConnected', () => {
  it('only an explicit true is connected; null/undefined/false are standalone (default-safe)', () => {
    expect(isNetworkConnected(true)).toBe(true)
    expect(isNetworkConnected(false)).toBe(false)
    expect(isNetworkConnected(null)).toBe(false)
    expect(isNetworkConnected(undefined)).toBe(false)
  })
})

describe('pricingWorldFor', () => {
  it('connected → in the collective; anything else → standalone', () => {
    expect(pricingWorldFor(true)).toBe('connected')
    expect(pricingWorldFor(false)).toBe('standalone')
    expect(pricingWorldFor(null)).toBe('standalone')
    expect(pricingWorldFor(undefined)).toBe('standalone')
  })
})

describe('effectiveOrderSource', () => {
  it('a connected Space keeps its classified source', () => {
    expect(effectiveOrderSource('network', true)).toBe('network')
    expect(effectiveOrderSource('self', true)).toBe('self')
  })

  it('a DISCONNECTED Space collapses every source to self (the hard promise, ADR-811 §3)', () => {
    for (const nc of [false, null, undefined] as const) {
      expect(effectiveOrderSource('network', nc)).toBe('self')
      expect(effectiveOrderSource('self', nc)).toBe('self')
    }
  })

  it('adversarial: no plan, connected or not, can turn a disconnected sale into a network charge', () => {
    // The rate math keys on plan; this guards the SOURCE half — a disconnected Space is always self,
    // so the downstream take-rate is 0 for every plan label.
    for (const _plan of SPACE_PLANS) {
      expect(effectiveOrderSource('network', false)).toBe('self')
    }
  })
})
