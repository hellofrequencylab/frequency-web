import { describe, it, expect } from 'vitest'
import {
  planFundsFlow,
  splitTotals,
  sellerKey,
  ONE_CURRENCY_PER_CART,
  STORE_CHECKS_OUT_ALONE,
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
    expect(plan).toEqual({ mode: 'destination', currency: 'usd', grossCents: 2500, seller: spaceA })
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
        { key: 'space::sp-a', seller: spaceA, grossCents: 1250 },
        { key: 'profile:pr-1:', seller: maker, grossCents: 600 },
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
  it('refuses a cart in two currencies with the ADR-1500 sentence, whether one seller or two', () => {
    expect(planFundsFlow([line(spaceA, 100, 1, 'cad'), line(spaceA, 100, 1, 'usd')])).toEqual({
      error: ONE_CURRENCY_PER_CART,
    })
    expect(planFundsFlow([line(spaceA, 100, 1, 'cad'), line(spaceB, 100, 1, 'usd')])).toEqual({
      error: ONE_CURRENCY_PER_CART,
    })
  })

  it('treats currency case as spelling, not as a second currency', () => {
    const plan = planFundsFlow([line(spaceA, 100, 1, 'CAD'), line(spaceB, 100, 1, 'cad')])
    expect(plan).toMatchObject({ mode: 'separate', currency: 'cad' })
  })

  it('never mixes the Frequency Store into a separate plan', () => {
    expect(planFundsFlow([line(store, 100), line(spaceA, 100)])).toEqual({ error: STORE_CHECKS_OUT_ALONE })
    expect(planFundsFlow([line(spaceA, 100), line(maker, 100), line(store, 100)])).toEqual({
      error: STORE_CHECKS_OUT_ALONE,
    })
  })

  it('an empty cart is refused before anything is grouped', () => {
    expect(planFundsFlow([])).toEqual({ error: 'Your cart is empty.' })
  })
})
