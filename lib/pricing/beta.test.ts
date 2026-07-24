import { describe, it, expect } from 'vitest'
import { BETA_PRICING_ENDS_AT, isBetaPricingActive, effectiveCatalogAmounts } from './beta'

// Beta pricing window (ADR-811): the $19 Business / $49 Collective anchors auto-revert to list on the
// cutover. These are the PURE helpers behind that; the checkout key switch + the display are wired on top.

describe('the beta pricing window', () => {
  const cutover = Date.parse(BETA_PRICING_ENDS_AT)

  it('the cutover constant parses to a real instant', () => {
    expect(Number.isFinite(cutover)).toBe(true)
    // 2026-09-01T07:00:00Z = midnight Pacific on Sep 1 (the documented cutover).
    expect(BETA_PRICING_ENDS_AT).toBe('2026-09-01T07:00:00.000Z')
  })

  it('is active strictly BEFORE the cutover', () => {
    expect(isBetaPricingActive(new Date(cutover - 1000))).toBe(true)
    expect(isBetaPricingActive(new Date('2026-07-24T00:00:00Z'))).toBe(true)
    expect(isBetaPricingActive(new Date('2026-08-31T23:59:59Z'))).toBe(true)
  })

  it('is NOT active AT or AFTER the cutover (fail-safe to list, never under-charge)', () => {
    expect(isBetaPricingActive(new Date(cutover))).toBe(false) // boundary: the instant it ends
    expect(isBetaPricingActive(new Date(cutover + 1000))).toBe(false)
    expect(isBetaPricingActive(new Date('2026-09-02T00:00:00Z'))).toBe(false)
    expect(isBetaPricingActive(new Date('2027-01-01T00:00:00Z'))).toBe(false)
  })
})

describe('effectiveCatalogAmounts', () => {
  const anchored = { listCents: 7900, foundingCents: 4900 } // Collective: $49 beta under $79 list
  const flat = { listCents: 3900, foundingCents: 3900 } // Non Profit: no beta discount

  it('during beta: passes the real {founding, list} split through unchanged (the struck anchor)', () => {
    expect(effectiveCatalogAmounts(anchored, true)).toEqual({ listCents: 7900, foundingCents: 4900 })
  })

  it('after beta: list becomes the charged price and the anchor collapses to it (no strike)', () => {
    expect(effectiveCatalogAmounts(anchored, false)).toEqual({ listCents: 7900, foundingCents: 7900 })
  })

  it('a flat item (founding == list) is unchanged in both windows', () => {
    expect(effectiveCatalogAmounts(flat, true)).toEqual(flat)
    expect(effectiveCatalogAmounts(flat, false)).toEqual(flat)
  })
})
