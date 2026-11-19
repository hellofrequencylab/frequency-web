import { describe, it, expect } from 'vitest'
import {
  planFundsFlow,
  splitTotals,
  sellerKey,
  withCardFeeShares,
  type SellerSplit,
  type FundsFlowLine,
} from './funds-flow'

// THE FUNDS-FLOW SEAM (LIVE-621, ADR-1576). MONEY CODE, pure, so every cart shape is pinned here
// without a Stripe key: one seller is a destination charge, two are separate charges and transfers,
// the per-seller fees add up to the row's fee, and the two carts the money cannot pay are refused.

const spaceA = { owner_kind: 'space' as const, owner_profile_id: null, owner_space_id: 'sp-a' }
const spaceB = { owner_kind: 'space' as const, owner_profile_id: null, owner_space_id: 'sp-b' }
const maker = { owner_kind: 'profile' as const, owner_profile_id: 'pr-1', owner_space_id: null }
const store = { owner_kind: 'platform' as const, owner_profile_id: null, owner_space_id: null }

function line(seller: FundsFlowLine['seller'], unitCents: number, qty = 1, currency = 'usd'): FundsFlowLine {
  return { seller, unitCents, qty, currency }
}

describe('planFundsFlow — one seller is a destination charge, as today', () => {
  it('a single Space cart plans destination with that seller and the summed gross', () => {
    const plan = planFundsFlow([line(spaceA, 1000, 2), line(spaceA, 500)])
    expect(plan).toEqual({
      mode: 'destination',
      currency: 'usd',
      grossCents: 2500,
      seller: spaceA,
      groups: [{ key: 'space::sp-a', seller: spaceA, grossCents: 2500, firstLine: 0 }],
    })
  })

  it('the Frequency Store on its own is destination too (a plain platform charge downstream)', () => {
    const plan = planFundsFlow([line(store, 1200)])
    expect(plan).toMatchObject({ mode: 'destination', seller: store, grossCents: 1200 })
  })

  it('two lines from one maker are ONE seller: the key is kind plus both owner ids', () => {
    const plan = planFundsFlow([line(maker, 900), line({ ...maker }, 100)])
    expect(plan).toMatchObject({ mode: 'destination', grossCents: 1000 })
    expect(sellerKey(maker)).toBe('profile:pr-1:')
    expect(sellerKey(spaceA)).toBe('space::sp-a')
  })
})

describe('planFundsFlow — two sellers are separate charges and transfers', () => {
  it('groups by seller in first-appearance order, each with its own gross', () => {
    const plan = planFundsFlow([line(spaceA, 1000), line(maker, 300, 2), line(spaceA, 250)])
    expect(plan).toEqual({
      mode: 'separate',
      currency: 'usd',
      grossCents: 1850,
      groups: [
        { key: 'space::sp-a', seller: spaceA, grossCents: 1250, firstLine: 0 },
        { key: 'profile:pr-1:', seller: maker, grossCents: 600, firstLine: 1 },
      ],
    })
  })

  it('the plan gross is the sum of the group grosses, cent for cent', () => {
    const plan = planFundsFlow([line(spaceA, 999, 3), line(spaceB, 1), line(maker, 12345)])
    if (!('mode' in plan) || plan.mode !== 'separate') throw new Error('expected a separate plan')
    expect(plan.groups.reduce((s, g) => s + g.grossCents, 0)).toBe(plan.grossCents)
    expect(plan.grossCents).toBe(999 * 3 + 1 + 12345)
  })

  it('the row fee of a separate order is the SUM of the per-seller fees, never a fee on the total', () => {
    // Each seller priced at its own rung by resolveCharge downstream: 5% for one Space, 3% for the
    // other, 10% for the person. Summing them is what splitTotals does; a single rate on the total
    // would give a different number for the same cart, which is the mistake this pins against.
    const splits = [
      { seller: spaceA, grossCents: 10000, platformFeeCents: 500, stripeAccountId: 'acct_a' },
      { seller: spaceB, grossCents: 10000, platformFeeCents: 300, stripeAccountId: 'acct_b' },
      { seller: maker, grossCents: 5000, platformFeeCents: 500, stripeAccountId: 'acct_m' },
    ]
    expect(splitTotals(splits)).toEqual({ grossCents: 25000, platformFeeCents: 1300 })
    expect(splitTotals([])).toEqual({ grossCents: 0, platformFeeCents: 0 })
  })
})

describe('planFundsFlow — the carts the money cannot pay as one charge', () => {
  it('refuses a cart in two currencies (ADR-1500), whether one seller or two', () => {
    expect(planFundsFlow([line(spaceA, 100, 1, 'cad'), line(spaceA, 100, 1, 'usd')])).toEqual({ refused: 'mixed_currency' })
    expect(planFundsFlow([line(spaceA, 100, 1, 'cad'), line(spaceB, 100, 1, 'usd')])).toEqual({ refused: 'mixed_currency' })
  })

  it('treats currency case as spelling, not as a second currency', () => {
    const plan = planFundsFlow([line(spaceA, 100, 1, 'CAD'), line(spaceB, 100, 1, 'cad')])
    expect(plan).toMatchObject({ mode: 'separate', currency: 'cad' })
  })

  it('never mixes the Frequency Store into a separate plan', () => {
    expect(planFundsFlow([line(store, 100), line(spaceA, 100)])).toEqual({ refused: 'store_with_others' })
    expect(planFundsFlow([line(spaceA, 100), line(maker, 100), line(store, 100)])).toEqual({ refused: 'store_with_others' })
  })

  it('an empty cart is refused before anything is grouped', () => {
    expect(planFundsFlow([])).toEqual({ refused: 'empty' })
  })
})

// THE CARD FEE ON A SPLIT CHARGE (LIVE-2421). The one card fee on the charge, shared by gross.
describe('withCardFeeShares', () => {
  const share = (seller: SellerSplit['seller'], grossCents: number, platformFeeCents = 0): SellerSplit => ({
    seller,
    grossCents,
    platformFeeCents,
    stripeAccountId: `acct_${seller.owner_space_id ?? seller.owner_profile_id}`,
  })

  it('shares the card fee by gross, remainder to the largest share, and adds up to the card fee', () => {
    // $30.00 at 2.9% + 30c = 117c. A 1000 / 2000 split: floor 39 and 78 = 117, nothing left over.
    const out = withCardFeeShares([share(spaceA, 1000, 50), share(spaceB, 2000, 100)], 117)
    expect(out.map((s) => s.processingFeeCents)).toEqual([39, 78])
    // 100c over three equal shares: 33 each, the 1c remainder to the first of equals.
    const even = withCardFeeShares([share(spaceA, 1000), share(spaceB, 1000), share(maker, 1000)], 100)
    expect(even.map((s) => s.processingFeeCents)).toEqual([34, 33, 33])
    expect(even.reduce((n, s) => n + (s.processingFeeCents ?? 0), 0)).toBe(100)
  })

  it('with the pass-through off every share carries 0', () => {
    const out = withCardFeeShares([share(spaceA, 1000, 50), share(spaceB, 2000, 100)], 0)
    expect(out.map((s) => s.processingFeeCents)).toEqual([0, 0])
    expect(out.map((s) => s.platformFeeCents)).toEqual([50, 100])
  })

  it('never asks a share for more than is left after its fee; the others take it, then the platform', () => {
    const out = withCardFeeShares([share(spaceA, 100, 98), share(spaceB, 900, 0)], 50)
    expect(out[0].processingFeeCents).toBe(2)
    expect(out[1].processingFeeCents).toBe(48)
    const tiny = withCardFeeShares([share(spaceA, 2, 1), share(spaceB, 2, 1)], 31)
    expect(tiny.map((s) => s.processingFeeCents)).toEqual([1, 1])
  })
})
