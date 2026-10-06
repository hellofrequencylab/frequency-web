import { describe, it, expect } from 'vitest'
import {
  asDomainMarkupCents,
  DOMAIN_MARKUP_DEFAULT_CENTS,
  DOMAIN_MARKUP_MAX_CENTS,
  formatYearlyPrice,
  quoteDomain,
  usdToCents,
} from './domain-pricing'

// The price of a domain bought inside Frequency (LIVE-781): Vercel's at-cost price plus the operator's
// markup, in whole cents, shown as one yearly price.

describe('usdToCents', () => {
  it('reads a Vercel dollar amount as a number or a numeric string', () => {
    expect(usdToCents(11.25)).toBe(1125)
    expect(usdToCents('11.25')).toBe(1125)
    expect(usdToCents('20')).toBe(2000)
  })

  it('rounds to the cent, never truncates', () => {
    expect(usdToCents(10.995)).toBe(1100)
    expect(usdToCents(0.1 + 0.2)).toBe(30)
  })

  it('refuses anything that is not a positive price', () => {
    for (const v of [0, -1, '', ' ', 'abc', null, undefined, NaN, Infinity, {}]) expect(usdToCents(v)).toBeNull()
  })
})

describe('quoteDomain', () => {
  it('adds the markup to the Vercel price for one yearly total', () => {
    expect(quoteDomain(1125, 300, 1125)).toEqual({ vercelCents: 1125, markupCents: 300, totalCents: 1425, renewalCents: 1425 })
  })

  it('prices the renewal from the renewal price plus the same markup', () => {
    expect(quoteDomain(499, 300, 2499).renewalCents).toBe(2799)
    expect(quoteDomain(499, 300, 2499).totalCents).toBe(799)
  })

  it('falls back to the purchase price when Vercel gives no renewal price', () => {
    expect(quoteDomain(1000, 300, null).renewalCents).toBe(1300)
    expect(quoteDomain(1000, 300).renewalCents).toBe(1300)
  })

  it('keeps whole cents and never goes negative', () => {
    const q = quoteDomain(1000.4, 299.6)
    expect(q.totalCents).toBe(1300)
    expect(Number.isInteger(q.totalCents)).toBe(true)
    expect(quoteDomain(1000, -50).totalCents).toBe(1000)
  })

  it('a zero markup is a pass-through at cost', () => {
    expect(quoteDomain(1125, 0).totalCents).toBe(1125)
  })
})

describe('asDomainMarkupCents', () => {
  it('reads the stored { cents } shape and a bare number', () => {
    expect(asDomainMarkupCents({ cents: 500 })).toBe(500)
    expect(asDomainMarkupCents(250)).toBe(250)
    expect(asDomainMarkupCents({ cents: 0 })).toBe(0)
  })

  it('defaults to $3 a year when nothing usable is stored', () => {
    expect(DOMAIN_MARKUP_DEFAULT_CENTS).toBe(300)
    for (const v of [undefined, null, 'x', { cents: -1 }, { cents: 'many' }, [], {}]) {
      expect(asDomainMarkupCents(v)).toBe(DOMAIN_MARKUP_DEFAULT_CENTS)
    }
  })

  it('clamps a typo to the ceiling rather than charging it', () => {
    expect(asDomainMarkupCents({ cents: 300_000 })).toBe(DOMAIN_MARKUP_MAX_CENTS)
  })
})

describe('formatYearlyPrice', () => {
  it('shows dollars and cents', () => {
    expect(formatYearlyPrice(1425)).toBe('$14.25')
    expect(formatYearlyPrice(2000)).toBe('$20.00')
  })
})
