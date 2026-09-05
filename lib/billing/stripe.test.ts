import { afterEach, describe, expect, it } from 'vitest'
import { tierForPrice } from './stripe'

const ORIGINAL = { ...process.env }
afterEach(() => {
  process.env = { ...ORIGINAL }
})

// 2026-09-05 (scan2 L3-04): the membershipAmount / priceFor suites that lived here are gone with
// the helpers. Neither had a caller outside this file; checkout mints its own price from the
// member's chosen amount, so the env knobs they read were documentation of nothing.

describe('the Supporter sell path is gone (ADR-878)', () => {
  it('tierForPrice always resolves crew, so a legacy Supporter price keeps paid access', () => {
    process.env.STRIPE_PRICE_SUPPORTER = 'price_supporter_legacy'
    expect(tierForPrice('price_supporter_legacy')).toBe('crew')
    expect(tierForPrice('price_anything')).toBe('crew')
    expect(tierForPrice(null)).toBe('crew')
  })
})
