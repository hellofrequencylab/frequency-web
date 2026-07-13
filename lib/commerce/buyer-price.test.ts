import { describe, it, expect } from 'vitest'
import {
  initialChosenCents,
  validateChosenAmount,
  priceSortValue,
  orderedPackageOptions,
} from './buyer-price'
import type { OfferingOption, Price } from './types'

// Buyer-side price logic (Pricing Options P2). Covers the Choose-your-price pre-fill, the buyer's
// floor check (the client mirror of the server's authoritative one), and the Good / Better / Best
// ordering + middle-highlight. PURE, so fully unit-testable.

describe('initialChosenCents', () => {
  it('pre-fills fixed to its amount, free to zero, contact to nothing', () => {
    expect(initialChosenCents({ mode: 'fixed', amountCents: 4000 })).toBe(4000)
    expect(initialChosenCents({ mode: 'free' })).toBe(0)
    expect(initialChosenCents({ mode: 'contact' })).toBeUndefined()
  })

  it('pre-fills choose to the suggested anchor first, then floor, then lowest chip', () => {
    expect(initialChosenCents({ mode: 'choose', suggestedCents: 2500, minCents: 1000 })).toBe(2500)
    expect(initialChosenCents({ mode: 'choose', minCents: 1000 })).toBe(1000)
    expect(
      initialChosenCents({ mode: 'choose', donation: true, pickAmountsCents: [1500, 3000] }),
    ).toBe(1500)
    expect(initialChosenCents({ mode: 'choose' })).toBeUndefined()
  })
})

describe('validateChosenAmount', () => {
  it('never fails free or contact', () => {
    expect(validateChosenAmount({ mode: 'free' }, undefined)).toBeNull()
    expect(validateChosenAmount({ mode: 'contact' }, undefined)).toBeNull()
  })

  it('flags a fixed offer with no price', () => {
    expect(validateChosenAmount({ mode: 'fixed', amountCents: 4000 }, 4000)).toBeNull()
    expect(validateChosenAmount({ mode: 'fixed', amountCents: 0 }, 0)).not.toBeNull()
  })

  it('requires a positive choose amount above the floor', () => {
    const p: Price = { mode: 'choose', suggestedCents: 2000, minCents: 1000 }
    expect(validateChosenAmount(p, 2000)).toBeNull()
    expect(validateChosenAmount(p, 1000)).toBeNull()
    expect(validateChosenAmount(p, 500)).toContain('$10')
    expect(validateChosenAmount(p, 0)).toBe('Enter an amount.')
    expect(validateChosenAmount(p, undefined)).toBe('Enter an amount.')
  })

  it('uses gift framing for a donation floor', () => {
    const p: Price = { mode: 'choose', donation: true, suggestedCents: 5000, minCents: 2000 }
    expect(validateChosenAmount(p, 1000)).toBe('The smallest gift is $20.')
  })

  it('treats a floorless choose as any-amount-above-zero', () => {
    const p: Price = { mode: 'choose', suggestedCents: 2000 }
    expect(validateChosenAmount(p, 50)).toBeNull()
    expect(validateChosenAmount(p, 0)).not.toBeNull()
  })
})

describe('priceSortValue', () => {
  it('sorts free first and contact last', () => {
    expect(priceSortValue({ mode: 'free' })).toBe(0)
    expect(priceSortValue({ mode: 'fixed', amountCents: 3000 })).toBe(3000)
    expect(priceSortValue({ mode: 'choose', suggestedCents: 2500 })).toBe(2500)
    expect(priceSortValue({ mode: 'contact' })).toBe(Number.MAX_SAFE_INTEGER)
  })
})

describe('orderedPackageOptions', () => {
  const opt = (name: string, price: Price, recommended?: boolean): OfferingOption => ({
    name,
    price,
    recommended,
  })

  it('orders low to high and marks the middle Most popular (Good / Better / Best)', () => {
    const { options, recommendedIndex } = orderedPackageOptions([
      opt('Best', { mode: 'fixed', amountCents: 9000 }),
      opt('Good', { mode: 'fixed', amountCents: 3000 }),
      opt('Better', { mode: 'fixed', amountCents: 6000 }),
    ])
    expect(options.map((o) => o.name)).toEqual(['Good', 'Better', 'Best'])
    expect(recommendedIndex).toBe(1)
    expect(options[1].recommended).toBe(true)
    expect(options.filter((o) => o.recommended).length).toBe(1)
  })

  it('honors an explicit recommended flag over the middle default', () => {
    const { recommendedIndex, options } = orderedPackageOptions([
      opt('Good', { mode: 'fixed', amountCents: 3000 }),
      opt('Better', { mode: 'fixed', amountCents: 6000 }),
      opt('Best', { mode: 'fixed', amountCents: 9000 }, true),
    ])
    expect(recommendedIndex).toBe(2)
    expect(options[2].recommended).toBe(true)
  })

  it('caps at four options', () => {
    const { options } = orderedPackageOptions([
      opt('A', { mode: 'fixed', amountCents: 100 }),
      opt('B', { mode: 'fixed', amountCents: 200 }),
      opt('C', { mode: 'fixed', amountCents: 300 }),
      opt('D', { mode: 'fixed', amountCents: 400 }),
      opt('E', { mode: 'fixed', amountCents: 500 }),
    ])
    expect(options).toHaveLength(4)
    expect(options.map((o) => o.name)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('returns an empty set with no recommendation', () => {
    expect(orderedPackageOptions([])).toEqual({ options: [], recommendedIndex: -1 })
  })
})
