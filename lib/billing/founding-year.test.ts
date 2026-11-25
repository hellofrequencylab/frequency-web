import { describe, it, expect } from 'vitest'
import {
  FOUNDING_YEAR,
  asFoundingYearPlan,
  foundingYearApplies,
  foundingYearCents,
  foundingYearOpen,
  foundingYearRenewsAtUnix,
  isFoundingYearMetadata,
} from './founding-year'
import { yearlyFromMonthly } from './pricing-keys'

// LIVE-2541 — the owner's Founding Year rulings (2026-11-23), pinned.
describe('the Founding Year', () => {
  it('costs Business $441 (nine months of $49) and Collective $990, paid now', () => {
    expect(foundingYearCents('business')).toBe(9 * 4900)
    expect(foundingYearCents('business')).toBe(44100)
    expect(foundingYearCents('collective')).toBe(99000)
    expect(FOUNDING_YEAR.renewalCents.business).toBe(yearlyFromMonthly(4900))
    expect(FOUNDING_YEAR.renewalCents.collective).toBe(yearlyFromMonthly(9900))
  })

  it('runs February 1, 2027 to January 31, 2028 (midnight Pacific to midnight Pacific)', () => {
    expect(FOUNDING_YEAR.yearStartsAt).toBe('2027-02-01T08:00:00.000Z')
    expect(foundingYearRenewsAtUnix()).toBe(Date.parse('2028-02-01T08:00:00.000Z') / 1000)
  })

  it('can be bought until the paid year starts, and not after', () => {
    expect(foundingYearOpen(new Date('2026-12-01T00:00:00Z'))).toBe(true)
    expect(foundingYearOpen(new Date('2027-02-01T07:59:59Z'))).toBe(true)
    expect(foundingYearOpen(new Date('2027-02-01T08:00:00Z'))).toBe(false)
  })

  it('applies only to a yearly Business or Collective with no locked price', () => {
    const now = new Date('2026-12-01T00:00:00Z')
    expect(foundingYearApplies({ plan: 'business', interval: 'year', baseLocked: false, now })).toBe('business')
    expect(foundingYearApplies({ plan: 'collective', interval: 'year', baseLocked: false, now })).toBe('collective')
    expect(foundingYearApplies({ plan: 'business', interval: 'month', baseLocked: false, now })).toBeNull()
    expect(foundingYearApplies({ plan: 'business', interval: 'year', baseLocked: true, now })).toBeNull()
    expect(foundingYearApplies({ plan: 'network', interval: 'year', baseLocked: false, now })).toBeNull()
    expect(foundingYearApplies({ plan: 'nonprofit', interval: 'year', baseLocked: false, now })).toBeNull()
    expect(asFoundingYearPlan('free')).toBeNull()
  })

  it('is told apart from a real trial by its metadata', () => {
    expect(isFoundingYearMetadata({ founding_year: 'prepay' })).toBe(true)
    expect(isFoundingYearMetadata({ kind: 'space_plan' })).toBe(false)
    expect(isFoundingYearMetadata(null)).toBe(false)
  })
})
