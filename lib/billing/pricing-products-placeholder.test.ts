import { describe, it, expect } from 'vitest'

// The PURE placeholder-skip resolver behind the catalog sync (ADR-799/803). The catalog sync mints NO
// Stripe product/price for an inert placeholder (the ABSOLUTE INVARIANT, ADR-362): the operator seat is
// inert until its activation switch is flipped on. Only the operator seat has an activation switch; every
// other placeholder stays inert regardless. This is the pure decision the sync feeds the live flag into.

import { isCatalogItemInertPlaceholder } from './pricing-products'
import { catalogItem } from './pricing-keys'

describe('isCatalogItemInertPlaceholder', () => {
  it('a non-placeholder item is never inert', () => {
    const biz = catalogItem('business_base')
    expect(biz.placeholder).toBeFalsy()
    expect(isCatalogItemInertPlaceholder(biz, false)).toBe(false)
    expect(isCatalogItemInertPlaceholder(biz, true)).toBe(false)
  })

  it('the operator seat is inert while its activation switch is OFF', () => {
    const seat = catalogItem('operator_seat')
    expect(seat.placeholder).toBe(true)
    expect(isCatalogItemInertPlaceholder(seat, false)).toBe(true)
  })

  it('the operator seat becomes syncable once its activation switch is ON', () => {
    const seat = catalogItem('operator_seat')
    expect(isCatalogItemInertPlaceholder(seat, true)).toBe(false)
  })

  it('a placeholder that is NOT the operator seat stays inert regardless of the seat switch', () => {
    // Guard the invariant against a future placeholder item gaining a switch it should not have.
    const fake = { ...catalogItem('business_base'), key: 'business_base' as const, placeholder: true }
    expect(isCatalogItemInertPlaceholder(fake, true)).toBe(true)
    expect(isCatalogItemInertPlaceholder(fake, false)).toBe(true)
  })
})
