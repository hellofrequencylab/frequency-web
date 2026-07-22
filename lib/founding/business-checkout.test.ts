import { describe, it, expect } from 'vitest'
import {
  foundingBusinessAnnualCents,
  foundingBusinessAnnualSavingsCents,
  foundingBusinessCheckoutState,
} from './business-checkout'

// PURE helper coverage for the founding Business checkout (ADR-804): the annual "two months free" math
// and the guard state machine (already_active > not_open > sold_out > open). No Stripe/Supabase.

describe('foundingBusinessAnnualCents', () => {
  it('is monthly * (12 - months_free): $49/mo with 2 free = $490/yr', () => {
    expect(foundingBusinessAnnualCents(4900, 2)).toBe(49000)
  })

  it('a full year with no free months is monthly * 12', () => {
    expect(foundingBusinessAnnualCents(4900, 0)).toBe(58800)
  })

  it('never hardcodes: a different monthly rate flows through', () => {
    expect(foundingBusinessAnnualCents(2900, 2)).toBe(29000) // Non Profit-shaped $29 -> $290
  })

  it('clamps a garbage months_free into [0, 12] and floors negatives to full-year', () => {
    expect(foundingBusinessAnnualCents(4900, -5)).toBe(58800) // clamped to 0 free
    expect(foundingBusinessAnnualCents(4900, 99)).toBe(0) // clamped to 12 free
  })

  it('floors a fractional / negative monthly to a non-negative integer', () => {
    expect(foundingBusinessAnnualCents(4900.9, 2)).toBe(49000)
    expect(foundingBusinessAnnualCents(-10, 2)).toBe(0)
  })
})

describe('foundingBusinessAnnualSavingsCents', () => {
  it('is the two-months-free amount: monthly * months_free', () => {
    expect(foundingBusinessAnnualSavingsCents(4900, 2)).toBe(9800)
  })

  it('is zero when no months are free', () => {
    expect(foundingBusinessAnnualSavingsCents(4900, 0)).toBe(0)
  })

  it('annual + savings reconstructs a full year (monthly * 12)', () => {
    const monthly = 4900
    const free = 2
    expect(
      foundingBusinessAnnualCents(monthly, free) + foundingBusinessAnnualSavingsCents(monthly, free),
    ).toBe(monthly * 12)
  })
})

describe('foundingBusinessCheckoutState', () => {
  it('is open when billing is live, spots remain, and the space is not paying', () => {
    expect(
      foundingBusinessCheckoutState({ billingLive: true, spaceIsPaying: false, spotsRemaining: 25 }),
    ).toBe('open')
  })

  it('is already_active when the space already pays (wins over every other gate)', () => {
    expect(
      foundingBusinessCheckoutState({ billingLive: true, spaceIsPaying: true, spotsRemaining: 25 }),
    ).toBe('already_active')
    // already_active still wins even if billing is off and the cohort is full.
    expect(
      foundingBusinessCheckoutState({ billingLive: false, spaceIsPaying: true, spotsRemaining: 0 }),
    ).toBe('already_active')
  })

  it('is not_open when billing is off (and the space is not paying)', () => {
    expect(
      foundingBusinessCheckoutState({ billingLive: false, spaceIsPaying: false, spotsRemaining: 25 }),
    ).toBe('not_open')
  })

  it('is sold_out when billing is live but no spots remain', () => {
    expect(
      foundingBusinessCheckoutState({ billingLive: true, spaceIsPaying: false, spotsRemaining: 0 }),
    ).toBe('sold_out')
  })

  it('treats a negative spots count as sold_out', () => {
    expect(
      foundingBusinessCheckoutState({ billingLive: true, spaceIsPaying: false, spotsRemaining: -3 }),
    ).toBe('sold_out')
  })
})
