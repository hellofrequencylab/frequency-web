import { describe, it, expect } from 'vitest'
import {
  normalizePrice,
  normalizePickAmounts,
  validatePrice,
  describePrice,
  formatPriceCents,
  priceToTicketPricingMode,
  ticketRowToPrice,
  type Price,
} from './types'

// The unified Price primitive (Pricing Options P1, ADR-607). These cover the four modes, the donation
// checkbox, validation (a suggested anchor is required for `choose`; the floor is optional), the
// display formatter, and the ticket-column adapters that keep stored rows valid with NO migration.

describe('normalizePrice', () => {
  it('defaults an unknown mode to fixed', () => {
    expect(normalizePrice({ mode: 'wat' }).mode).toBe('fixed')
  })

  it('keeps only the fixed amount for a fixed price', () => {
    expect(normalizePrice({ mode: 'fixed', amountCents: 4000, minCents: 100 })).toEqual({
      mode: 'fixed',
      amountCents: 4000,
    })
  })

  it('coerces a missing fixed amount to zero (validation flags it later)', () => {
    expect(normalizePrice({ mode: 'fixed' })).toEqual({ mode: 'fixed', amountCents: 0 })
  })

  it('strips amount fields from free and contact', () => {
    expect(normalizePrice({ mode: 'free', amountCents: 4000 })).toEqual({ mode: 'free' })
    expect(normalizePrice({ mode: 'contact', suggestedCents: 4000 })).toEqual({ mode: 'contact' })
  })

  it('keeps suggested + optional floor for a choose price', () => {
    expect(normalizePrice({ mode: 'choose', suggestedCents: 2000, minCents: 500 })).toEqual({
      mode: 'choose',
      suggestedCents: 2000,
      minCents: 500,
    })
  })

  it('drops a zero suggested anchor but keeps a zero floor', () => {
    expect(normalizePrice({ mode: 'choose', suggestedCents: 0, minCents: 0 })).toEqual({
      mode: 'choose',
      minCents: 0,
    })
  })

  it('carries donation + pick amounts only when donation is on', () => {
    expect(
      normalizePrice({
        mode: 'choose',
        donation: true,
        suggestedCents: 2500,
        pickAmountsCents: [5000, 2500, 2500, -1, 10000],
      }),
    ).toEqual({
      mode: 'choose',
      donation: true,
      suggestedCents: 2500,
      pickAmountsCents: [2500, 5000, 10000],
    })
  })

  it('ignores pick amounts when donation is off', () => {
    const p = normalizePrice({ mode: 'choose', suggestedCents: 2500, pickAmountsCents: [5000] })
    expect(p.pickAmountsCents).toBeUndefined()
    expect(p.donation).toBeUndefined()
  })
})

describe('normalizePickAmounts', () => {
  it('drops non-positive / malformed, de-dupes, sorts, caps at 8', () => {
    expect(normalizePickAmounts([300, 100, 100, 0, -5, 'x', 200])).toEqual([100, 200, 300])
    expect(normalizePickAmounts('nope')).toEqual([])
    expect(normalizePickAmounts([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toHaveLength(8)
  })
})

describe('validatePrice', () => {
  it('passes free and contact unconditionally', () => {
    expect(validatePrice({ mode: 'free' })).toBeNull()
    expect(validatePrice({ mode: 'contact' })).toBeNull()
  })

  it('requires a positive amount for fixed', () => {
    expect(validatePrice({ mode: 'fixed', amountCents: 4000 })).toBeNull()
    expect(validatePrice({ mode: 'fixed', amountCents: 0 })).not.toBeNull()
    expect(validatePrice({ mode: 'fixed' })).not.toBeNull()
  })

  it('requires a suggested anchor for choose (the floor stays optional)', () => {
    expect(validatePrice({ mode: 'choose', suggestedCents: 2000 })).toBeNull()
    expect(validatePrice({ mode: 'choose', suggestedCents: 2000, minCents: 500 })).toBeNull()
    expect(validatePrice({ mode: 'choose' })).not.toBeNull()
    expect(validatePrice({ mode: 'choose', minCents: 500 })).not.toBeNull()
  })

  it('rejects a suggested anchor below the floor', () => {
    expect(validatePrice({ mode: 'choose', suggestedCents: 500, minCents: 1000 })).not.toBeNull()
  })
})

describe('describePrice', () => {
  it('labels each mode', () => {
    expect(describePrice({ mode: 'free' })).toBe('Free')
    expect(describePrice({ mode: 'contact' })).toBe('Enquire')
    expect(describePrice({ mode: 'fixed', amountCents: 4000 })).toBe('Fixed $40')
    expect(describePrice({ mode: 'fixed', amountCents: 2550 })).toBe('Fixed $25.50')
    expect(describePrice({ mode: 'choose', suggestedCents: 2000 })).toBe('Choose your price')
    expect(describePrice({ mode: 'choose', suggestedCents: 2000, minCents: 1000 })).toBe('From $10')
    expect(describePrice({ mode: 'choose', donation: true, suggestedCents: 2000 })).toBe('Donation')
  })
})

describe('formatPriceCents', () => {
  it('drops cents for whole dollars', () => {
    expect(formatPriceCents(4000)).toBe('$40')
    expect(formatPriceCents(2550)).toBe('$25.50')
  })
})

describe('ticket-tier adapters (no migration)', () => {
  it('maps each mode onto the legacy columns', () => {
    expect(priceToTicketPricingMode({ mode: 'fixed', amountCents: 2000 })).toMatchObject({
      pricing_mode: 'fixed',
      price_cents: 2000,
    })
    expect(priceToTicketPricingMode({ mode: 'free' })).toMatchObject({ pricing_mode: 'free' })
    expect(priceToTicketPricingMode({ mode: 'contact' })).toMatchObject({ pricing_mode: 'free' })
    // choose, no floor -> pwyc
    expect(priceToTicketPricingMode({ mode: 'choose', suggestedCents: 2000 })).toMatchObject({
      pricing_mode: 'pwyc',
      suggested_cents: 2000,
      min_cents: null,
    })
    // choose, with floor -> sliding_scale
    expect(
      priceToTicketPricingMode({ mode: 'choose', suggestedCents: 2000, minCents: 500 }),
    ).toMatchObject({ pricing_mode: 'sliding_scale', suggested_cents: 2000, min_cents: 500 })
    // choose + donation -> donation
    expect(
      priceToTicketPricingMode({ mode: 'choose', donation: true, suggestedCents: 2000 }),
    ).toMatchObject({ pricing_mode: 'donation', suggested_cents: 2000 })
  })

  it('round-trips a stored row back into a Price', () => {
    const cases: Price[] = [
      { mode: 'fixed', amountCents: 2000 },
      { mode: 'free' },
      { mode: 'choose', suggestedCents: 2000 },
      { mode: 'choose', suggestedCents: 2000, minCents: 500 },
      { mode: 'choose', donation: true, suggestedCents: 2000, minCents: 100 },
    ]
    for (const price of cases) {
      expect(ticketRowToPrice(priceToTicketPricingMode(price))).toEqual(price)
    }
  })

  it('reads a legacy pwyc row as a choose price', () => {
    expect(
      ticketRowToPrice({
        pricing_mode: 'pwyc',
        price_cents: null,
        min_cents: null,
        suggested_cents: 1500,
      }),
    ).toEqual({ mode: 'choose', suggestedCents: 1500 })
  })
})
