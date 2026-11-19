import { describe, it, expect } from 'vitest'
import { PAID_PRICE_MIN_CENTS, isAllowedSellingPrice, sellingPriceError } from './paid-price-floor'
import { applyTicketTierFloor } from '@/lib/events/ticket-tiers'

// THE $3 FLOOR (owner ruling 2026-11-19): a new paid ticket or product charges at least $3; free
// stays free; a price already stored under $3 keeps selling.
describe('isAllowedSellingPrice', () => {
  it('free, $3 and above pass; a cent to $2.99 is refused', () => {
    expect(PAID_PRICE_MIN_CENTS).toBe(300)
    expect(isAllowedSellingPrice(0)).toBe(true)
    expect(isAllowedSellingPrice(300)).toBe(true)
    expect(isAllowedSellingPrice(2500)).toBe(true)
    expect(isAllowedSellingPrice(1)).toBe(false)
    expect(isAllowedSellingPrice(299)).toBe(false)
    expect(isAllowedSellingPrice(-1)).toBe(false)
    expect(isAllowedSellingPrice(null)).toBe(true)
  })

  it('a price kept as it was stored is never refused, a change to another low price is', () => {
    expect(isAllowedSellingPrice(200, 200)).toBe(true)
    expect(isAllowedSellingPrice(150, 200)).toBe(false)
    expect(sellingPriceError(100, 'ticket')).toBe('A paid ticket starts at $3. Set it to free, or to $3 or more.')
    expect(sellingPriceError(100, 'item')).toBe('A paid item starts at $3. Set it to $3 or more.')
  })
})

describe('applyTicketTierFloor', () => {
  const tier = (pricing_mode: 'free' | 'fixed' | 'pwyc', price_cents: number | null, min_cents: number | null) => ({
    pricing_mode,
    price_cents,
    min_cents,
  })

  it('refuses a new fixed tier under $3 and passes free and $3', () => {
    expect(() => applyTicketTierFloor(tier('fixed', 200, null))).toThrow('starts at $3')
    expect(applyTicketTierFloor(tier('fixed', 300, null)).price_cents).toBe(300)
    expect(applyTicketTierFloor(tier('free', null, null)).pricing_mode).toBe('free')
  })

  it('keeps a grandfathered fixed price on an edit that does not change it', () => {
    expect(applyTicketTierFloor(tier('fixed', 200, null), tier('fixed', 200, null)).price_cents).toBe(200)
    expect(() => applyTicketTierFloor(tier('fixed', 150, null), tier('fixed', 200, null))).toThrow('starts at $3')
  })

  it('a new buyer-chosen tier with no floor starts at $3; an old one with none keeps none', () => {
    expect(applyTicketTierFloor(tier('pwyc', null, null)).min_cents).toBe(300)
    expect(applyTicketTierFloor(tier('pwyc', null, null), tier('pwyc', null, null)).min_cents).toBe(null)
    expect(() => applyTicketTierFloor(tier('pwyc', null, 100))).toThrow('starts at $3')
    expect(applyTicketTierFloor(tier('pwyc', null, 500)).min_cents).toBe(500)
  })
})
