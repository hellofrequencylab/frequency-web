import { describe, it, expect, afterEach } from 'vitest'
import { platformFeePct, platformFeeCents } from './fees'

const ORIG = process.env.STRIPE_PLATFORM_FEE_PCT

afterEach(() => {
  if (ORIG === undefined) delete process.env.STRIPE_PLATFORM_FEE_PCT
  else process.env.STRIPE_PLATFORM_FEE_PCT = ORIG
})

describe('platformFeePct', () => {
  it('defaults to 10 when unset', () => {
    delete process.env.STRIPE_PLATFORM_FEE_PCT
    expect(platformFeePct()).toBe(10)
  })

  it('reads a valid env override', () => {
    process.env.STRIPE_PLATFORM_FEE_PCT = '15'
    expect(platformFeePct()).toBe(15)
  })

  it('falls back to 10 on garbage / out-of-range values', () => {
    for (const bad of ['abc', '-5', '150', '']) {
      process.env.STRIPE_PLATFORM_FEE_PCT = bad
      expect(platformFeePct()).toBe(10)
    }
  })

  it('accepts the boundary values 0 and 100', () => {
    process.env.STRIPE_PLATFORM_FEE_PCT = '0'
    expect(platformFeePct()).toBe(0)
    process.env.STRIPE_PLATFORM_FEE_PCT = '100'
    expect(platformFeePct()).toBe(100)
  })
})

describe('platformFeeCents', () => {
  it('takes the configured percentage of the gross', () => {
    process.env.STRIPE_PLATFORM_FEE_PCT = '10'
    expect(platformFeeCents(1000)).toBe(100)
    expect(platformFeeCents(500)).toBe(50)
  })

  it('floors fractional cents so the recipient is never short-changed', () => {
    process.env.STRIPE_PLATFORM_FEE_PCT = '10'
    // 333 * 0.10 = 33.3 → floor 33
    expect(platformFeeCents(333)).toBe(33)
  })

  it('is zero for a 0% fee', () => {
    process.env.STRIPE_PLATFORM_FEE_PCT = '0'
    expect(platformFeeCents(1000)).toBe(0)
  })

  it('returns 0 for non-positive or invalid gross amounts', () => {
    process.env.STRIPE_PLATFORM_FEE_PCT = '10'
    expect(platformFeeCents(0)).toBe(0)
    expect(platformFeeCents(-100)).toBe(0)
    expect(platformFeeCents(NaN)).toBe(0)
  })
})
