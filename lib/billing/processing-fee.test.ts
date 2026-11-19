import { describe, it, expect } from 'vitest'
import {
  CARD_PROCESSING_BPS,
  CARD_PROCESSING_FIXED_CENTS,
  applicationFeePercent,
  cardProcessingCents,
  sellerFeeBreakdown,
  sellerNetCents,
} from './processing-fee'

// The card fee a seller bears (owner ruling 2026-11-18). The figures below are the ones the owner
// was shown in the take rate survey, so a change to the rate or the rounding shows up here first.
describe('cardProcessingCents (Stripe standard rate: 2.9% + 30c)', () => {
  it('is the published standard rate', () => {
    expect(CARD_PROCESSING_BPS).toBe(290)
    expect(CARD_PROCESSING_FIXED_CENTS).toBe(30)
  })

  it('prices the survey price points', () => {
    expect(cardProcessingCents(1000)).toBe(59)
    expect(cardProcessingCents(2000)).toBe(88)
    expect(cardProcessingCents(2500)).toBe(103)
    expect(cardProcessingCents(5000)).toBe(175)
    expect(cardProcessingCents(10000)).toBe(320)
  })

  it('is zero for a charge that is not a positive amount', () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) expect(cardProcessingCents(bad)).toBe(0)
  })

  it('never exceeds the charge', () => {
    expect(cardProcessingCents(1)).toBe(1)
    expect(cardProcessingCents(20)).toBe(20)
    expect(cardProcessingCents(31)).toBe(31)
    expect(cardProcessingCents(100)).toBe(33)
  })
})

describe('sellerFeeBreakdown', () => {
  it('own audience: Frequency takes nothing and the seller bears the card fee', () => {
    const b = sellerFeeBreakdown(2500, 0)
    expect(b).toEqual({ platformFeeCents: 0, processingFeeCents: 103, applicationFeeCents: 103 })
    expect(sellerNetCents(2500, b)).toBe(2397)
  })

  it('a fee-bearing sale keeps the two fees apart and adds them for Stripe', () => {
    const b = sellerFeeBreakdown(2500, 125)
    expect(b).toEqual({ platformFeeCents: 125, processingFeeCents: 103, applicationFeeCents: 228 })
    expect(sellerNetCents(2500, b)).toBe(2272)
  })

  it('passThrough off is the old shape: the application fee is the platform fee alone', () => {
    expect(sellerFeeBreakdown(2500, 125, { passThrough: false })).toEqual({
      platformFeeCents: 125,
      processingFeeCents: 0,
      applicationFeeCents: 125,
    })
    expect(sellerFeeBreakdown(2500, 0, { passThrough: false }).applicationFeeCents).toBe(0)
  })

  it('never asks Stripe for more than the charge, and the card fee yields first', () => {
    const tiny = sellerFeeBreakdown(40, 10)
    expect(tiny.platformFeeCents).toBe(10)
    expect(tiny.processingFeeCents).toBe(30)
    expect(tiny.applicationFeeCents).toBe(40)
    expect(sellerNetCents(40, tiny)).toBe(0)

    const over = sellerFeeBreakdown(100, 500)
    expect(over).toEqual({ platformFeeCents: 100, processingFeeCents: 0, applicationFeeCents: 100 })
  })

  it('a garbage platform fee is treated as none, never as NaN', () => {
    expect(sellerFeeBreakdown(2500, Number.NaN).platformFeeCents).toBe(0)
    expect(sellerFeeBreakdown(2500, -50).platformFeeCents).toBe(0)
    expect(sellerFeeBreakdown(0, 50)).toEqual({ platformFeeCents: 0, processingFeeCents: 0, applicationFeeCents: 0 })
  })
})

describe('applicationFeePercent (subscriptions cannot carry a fixed amount)', () => {
  it('expresses both fees as a percent of the recurring price, rounded up', () => {
    // $50 membership, own audience: card fee 175 cents = 3.5%.
    expect(applicationFeePercent(5000, sellerFeeBreakdown(5000, 0))).toBe(3.5)
    // $3 floor membership: card fee 39 cents = 13%.
    expect(applicationFeePercent(300, sellerFeeBreakdown(300, 0))).toBe(13)
    // $25: 103 / 2500 = 4.12%.
    expect(applicationFeePercent(2500, sellerFeeBreakdown(2500, 0))).toBe(4.12)
    // A third of a cent rounds up to the next hundredth, never down.
    expect(applicationFeePercent(3333, { platformFeeCents: 0, processingFeeCents: 127, applicationFeeCents: 127 })).toBe(3.82)
  })

  it('is zero with pass-through off and no platform fee, and capped at 100', () => {
    expect(applicationFeePercent(5000, sellerFeeBreakdown(5000, 0, { passThrough: false }))).toBe(0)
    expect(applicationFeePercent(20, sellerFeeBreakdown(20, 0))).toBe(100)
    expect(applicationFeePercent(0, sellerFeeBreakdown(0, 0))).toBe(0)
  })
})
