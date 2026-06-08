import { afterEach, describe, expect, it } from 'vitest'
import { membershipAmount } from './stripe'

const ORIGINAL = { ...process.env }
afterEach(() => {
  process.env = { ...ORIGINAL }
})

describe('membershipAmount', () => {
  it('defaults Crew to $10 and Supporter to $25', () => {
    delete process.env.STRIPE_MEMBERSHIP_AMOUNT
    delete process.env.STRIPE_SUPPORTER_AMOUNT
    expect(membershipAmount()).toBe(1000)
    expect(membershipAmount('crew')).toBe(1000)
    expect(membershipAmount('supporter')).toBe(2500)
  })

  it('reads the per-tier env override', () => {
    process.env.STRIPE_MEMBERSHIP_AMOUNT = '1500'
    process.env.STRIPE_SUPPORTER_AMOUNT = '5000'
    expect(membershipAmount('crew')).toBe(1500)
    expect(membershipAmount('supporter')).toBe(5000)
  })

  it('ignores a non-positive or non-numeric override', () => {
    process.env.STRIPE_SUPPORTER_AMOUNT = '0'
    expect(membershipAmount('supporter')).toBe(2500)
    process.env.STRIPE_SUPPORTER_AMOUNT = 'free'
    expect(membershipAmount('supporter')).toBe(2500)
  })
})
