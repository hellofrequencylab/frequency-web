import { describe, it, expect } from 'vitest'
import { effectiveVariantPriceCents, effectiveVariantStock } from './types'

// Etsy-Grade Phase 2: the per-variant effective-price + effective-stock resolvers. A variant OVERRIDES
// the product on price (null = inherit) and GOVERNS its own stock (null = untracked, never inherits).

describe('effectiveVariantPriceCents (variant overrides product; null = inherit)', () => {
  const product = { priceCents: 4000 }

  it('uses the variant price when it overrides the product', () => {
    expect(effectiveVariantPriceCents(product, { priceCents: 5500 })).toBe(5500)
  })

  it('inherits the product price when the variant price is null', () => {
    expect(effectiveVariantPriceCents(product, { priceCents: null })).toBe(4000)
  })

  it('treats a variant price of 0 as an explicit free override, not inherit', () => {
    expect(effectiveVariantPriceCents(product, { priceCents: 0 })).toBe(0)
  })
})

describe('effectiveVariantStock (variant governs its own stock; null = untracked)', () => {
  it('returns the variant stock when tracked', () => {
    expect(effectiveVariantStock({ stock: 3 })).toBe(3)
  })

  it('returns null (untracked / unlimited) when the variant does not track stock', () => {
    expect(effectiveVariantStock({ stock: null })).toBeNull()
  })

  it('reports 0 as sold out, distinct from untracked null', () => {
    expect(effectiveVariantStock({ stock: 0 })).toBe(0)
  })
})
