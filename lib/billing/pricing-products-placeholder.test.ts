import { describe, it, expect } from 'vitest'

// The PURE placeholder-skip resolver behind the catalog sync (ADR-799/803 / ADR-1435). The catalog
// sync mints NO Stripe product/price for an inert placeholder. The operator seat and its activation
// switch are retired (ADR-1810), so no item has an exception: a placeholder is inert, full stop.

import { isCatalogItemInertPlaceholder } from './pricing-products'
import { catalogItem } from './pricing-keys'

describe('isCatalogItemInertPlaceholder', () => {
  it('a non-placeholder item is never inert', () => {
    const biz = catalogItem('business_base')
    expect(biz.placeholder).toBeFalsy()
    expect(isCatalogItemInertPlaceholder(biz)).toBe(false)
  })

  it('a placeholder item is inert, with no switch to lift it', () => {
    const fake = { ...catalogItem('business_base'), key: 'business_base' as const, placeholder: true }
    expect(isCatalogItemInertPlaceholder(fake)).toBe(true)
  })
})
