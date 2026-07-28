import { afterEach, describe, expect, it } from 'vitest'
import { membershipAmount, priceFor, tierForPrice } from './stripe'

const ORIGINAL = { ...process.env }
afterEach(() => {
  process.env = { ...ORIGINAL }
})

describe('membershipAmount', () => {
  it('defaults Crew to $10 (the one sellable member tier, ADR-878)', () => {
    delete process.env.STRIPE_MEMBERSHIP_AMOUNT
    expect(membershipAmount()).toBe(1000)
  })

  it('reads the env override', () => {
    process.env.STRIPE_MEMBERSHIP_AMOUNT = '1500'
    expect(membershipAmount()).toBe(1500)
  })

  it('ignores a non-positive or non-numeric override', () => {
    process.env.STRIPE_MEMBERSHIP_AMOUNT = '0'
    expect(membershipAmount()).toBe(1000)
    process.env.STRIPE_MEMBERSHIP_AMOUNT = 'free'
    expect(membershipAmount()).toBe(1000)
  })

  // ADR-878: Supporter left the sellable ladder, so the Supporter env knobs are dead. Setting them
  // must not move the amount a member is charged, and must never resurface a $25 member price.
  it('the retired Supporter env knobs are inert', () => {
    process.env.STRIPE_SUPPORTER_AMOUNT = '5000'
    delete process.env.STRIPE_MEMBERSHIP_AMOUNT
    expect(membershipAmount()).toBe(1000)
  })
})

describe('the Supporter sell path is gone (ADR-878)', () => {
  it('priceFor never resolves a Supporter price id, even with the env set', () => {
    process.env.STRIPE_PRICE_SUPPORTER = 'price_supporter_legacy'
    process.env.STRIPE_PRICE_CREW = 'price_crew'
    expect(priceFor('supporter')).toBeNull()
    expect(priceFor('free')).toBeNull()
    expect(priceFor('crew')).toBe('price_crew')
  })

  it('tierForPrice always resolves crew, so a legacy Supporter price keeps paid access', () => {
    process.env.STRIPE_PRICE_SUPPORTER = 'price_supporter_legacy'
    expect(tierForPrice('price_supporter_legacy')).toBe('crew')
    expect(tierForPrice('price_anything')).toBe('crew')
    expect(tierForPrice(null)).toBe('crew')
  })
})
