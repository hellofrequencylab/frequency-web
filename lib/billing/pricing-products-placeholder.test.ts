import { describe, it, expect } from 'vitest'

// The PURE placeholder-skip resolver behind the catalog sync (ADR-799/803 / ADR-1416). The catalog
// sync mints NO Stripe product/price for an inert placeholder. LIVE-229 cleared the operator seat's
// placeholder, so that item is never inert; only a future placeholder item (or a fake in these
// tests) still skips. The seat switch is the sell gate, not the mint gate.

import { isCatalogItemInertPlaceholder } from './pricing-products'
import { catalogItem } from './pricing-keys'

describe('isCatalogItemInertPlaceholder', () => {
  it('a non-placeholder item is never inert', () => {
    const biz = catalogItem('business_base')
    expect(biz.placeholder).toBeFalsy()
    expect(isCatalogItemInertPlaceholder(biz, false)).toBe(false)
    expect(isCatalogItemInertPlaceholder(biz, true)).toBe(false)
  })

  it('the operator seat is no longer a placeholder, so a routine sync may mint it (LIVE-229)', () => {
    const seat = catalogItem('operator_seat')
    expect(seat.placeholder).toBeFalsy()
    expect(isCatalogItemInertPlaceholder(seat, false)).toBe(false)
    expect(isCatalogItemInertPlaceholder(seat, true)).toBe(false)
  })

  it('a placeholder that is NOT the operator seat stays inert regardless of the seat switch', () => {
    // Guard the invariant against a future placeholder item gaining a switch it should not have.
    const fake = { ...catalogItem('business_base'), key: 'business_base' as const, placeholder: true }
    expect(isCatalogItemInertPlaceholder(fake, true)).toBe(true)
    expect(isCatalogItemInertPlaceholder(fake, false)).toBe(true)
  })
})
