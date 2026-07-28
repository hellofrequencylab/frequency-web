import { describe, it, expect } from 'vitest'
import type Stripe from 'stripe'

// ADR-880 — AN ENTITLEMENT IS EARNED BY MONEY MOVING, FOR THE YEAR.
//
// The founding badge is a lifetime, publicly visible status plus a grandfathered rate, and nothing in
// the repo used to write it back to 'lapsed'. So every one of these branches is the difference between
// a real founder and a permanent, wrongly-issued one:
//
//   1. A 14-day TRIAL (every Space checkout sets trial_period_days) is not a payment.
//   2. past_due / incomplete / unpaid are FAILED payments, not payments.
//   3. A 100%-off promotion code (allow_promotion_codes is on) is an ACTIVE $0 subscription.
//   4. The base plan is found by its CATALOG KEY, never items.data[0]: a loadout is base + Vera AI +
//      operator seats in no guaranteed order.
//   5. The badge comes with the YEAR (owner rule, 2026-07). A monthly subscriber pays, and earns no
//      badge.
//   6. The locked rate is per MONTH even for a yearly purchase, and it is the BASE item's rate.

import {
  baseItemKey,
  baseSubscriptionItem,
  catalogKeyForItem,
  foundingPaymentSignal,
  fullyDiscounted,
  invoiceAmountPaidCents,
  isAnnualBaseItem,
  monthlyRateCentsForItem,
} from './founding-payment'

function item(
  catalogKey: string | null,
  opts: { interval?: 'month' | 'year'; unitAmount?: number | null; quantity?: number } = {},
): Stripe.SubscriptionItem {
  return {
    id: `si_${catalogKey ?? 'bare'}`,
    quantity: opts.quantity ?? 1,
    price: {
      id: `price_${catalogKey ?? 'bare'}`,
      unit_amount: opts.unitAmount === undefined ? 1900 : opts.unitAmount,
      recurring: { interval: opts.interval ?? 'month' },
      metadata: catalogKey ? { frequency_pricing_key: catalogKey } : {},
    },
  } as unknown as Stripe.SubscriptionItem
}

function sub(
  status: Stripe.Subscription.Status,
  items: Stripe.SubscriptionItem[],
  extra: Record<string, unknown> = {},
): Stripe.Subscription {
  return { id: 'sub_1', status, items: { data: items }, ...extra } as unknown as Stripe.Subscription
}

const ANNUAL_BUSINESS = item('business_base_year', { interval: 'year', unitAmount: 19000 })
const MONTHLY_BUSINESS = item('business_base_month', { unitAmount: 1900 })

// ── 1. Finding the BASE item (never index 0) ─────────────────────────────────────────────────────

describe('baseSubscriptionItem', () => {
  it('finds the base behind the add-on and the seat line, whatever the order', () => {
    const s = sub('active', [
      item('operator_seat_month', { unitAmount: 900, quantity: 4 }),
      item('addon_ai_month', { unitAmount: 2000 }),
      MONTHLY_BUSINESS,
    ])
    expect(baseSubscriptionItem(s)?.id).toBe('si_business_base_month')
    expect(baseItemKey(s)).toBe('business')
  })

  it('picks the HIGHER tier when a subscription somehow carries two bases', () => {
    const s = sub('active', [MONTHLY_BUSINESS, item('collective_base_month', { unitAmount: 4900 })])
    expect(catalogKeyForItem(baseSubscriptionItem(s))).toBe('collective_base')
  })

  it('a single un-keyed item (a member Crew sub, a legacy single-price Space sub) IS the base', () => {
    const s = sub('active', [item(null, { unitAmount: 9000, interval: 'year' })])
    expect(baseSubscriptionItem(s)?.id).toBe('si_bare')
  })

  it('refuses to guess: several items, none of them a known base, resolves to nothing', () => {
    const s = sub('active', [item('addon_ai_month', { unitAmount: 2000 }), item(null)])
    expect(baseSubscriptionItem(s)).toBeNull()
    expect(foundingPaymentSignal(s).reason).toBe('no_base_item')
  })

  it('an empty item set resolves to nothing', () => {
    expect(baseSubscriptionItem(sub('active', []))).toBeNull()
  })

  it('a retired legacy base still resolves (a grandfathered subscription keeps working)', () => {
    expect(catalogKeyForItem(item('pro_base_month'))).toBe('pro_base')
    expect(baseItemKey(sub('active', [item('pro_base_month')]))).toBe('base')
  })
})

// ── 2. The MONTHLY normalization of the locked rate (defect 6) ────────────────────────────────────

describe('monthlyRateCentsForItem', () => {
  it('a monthly price is its own monthly rate', () => {
    expect(monthlyRateCentsForItem(MONTHLY_BUSINESS)).toBe(1900)
  })

  it('a YEARLY price normalizes to the plan rate it is ten months of, not a /12 average', () => {
    expect(monthlyRateCentsForItem(ANNUAL_BUSINESS)).toBe(1900)
    expect(monthlyRateCentsForItem(item('collective_base_year', { interval: 'year', unitAmount: 49000 }))).toBe(4900)
    expect(monthlyRateCentsForItem(item('nonprofit_seat_year', { interval: 'year', unitAmount: 39000 }))).toBe(3900)
  })

  it('IGNORES quantity: a locked rate is a rate, not a bill', () => {
    expect(monthlyRateCentsForItem(item('business_base_month', { unitAmount: 1900, quantity: 7 }))).toBe(1900)
  })

  it('a price with no amount is unknown, not zero', () => {
    expect(monthlyRateCentsForItem(item('business_base_month', { unitAmount: null }))).toBeNull()
    expect(monthlyRateCentsForItem(null)).toBeNull()
  })

  it('isAnnualBaseItem reads the PRICE interval, which is what Stripe bills on', () => {
    expect(isAnnualBaseItem(ANNUAL_BUSINESS)).toBe(true)
    expect(isAnnualBaseItem(MONTHLY_BUSINESS)).toBe(false)
  })
})

// ── 3. The money test ────────────────────────────────────────────────────────────────────────────

describe('foundingPaymentSignal — nothing but a paid year earns it', () => {
  it('an ACTIVE, ANNUAL, non-zero base plan earns founding', () => {
    const signal = foundingPaymentSignal(sub('active', [ANNUAL_BUSINESS]))
    expect(signal).toEqual({
      paid: true,
      annual: true,
      earnsFounding: true,
      reason: 'earned',
      monthlyRateCents: 1900,
      chargedCents: 19000,
    })
  })

  it('TRIALING earns nothing (this is the live defect: every Space checkout sets a 14-day trial)', () => {
    const signal = foundingPaymentSignal(sub('trialing', [ANNUAL_BUSINESS]))
    expect(signal.earnsFounding).toBe(false)
    expect(signal.reason).toBe('not_active')
  })

  it('past_due, unpaid, incomplete, incomplete_expired, canceled and paused all earn nothing', () => {
    for (const status of [
      'past_due',
      'unpaid',
      'incomplete',
      'incomplete_expired',
      'canceled',
      'paused',
    ] as Stripe.Subscription.Status[]) {
      const signal = foundingPaymentSignal(sub(status, [ANNUAL_BUSINESS]))
      expect(signal.earnsFounding, status).toBe(false)
      expect(signal.reason, status).toBe('not_active')
    }
  })

  it('a MONTHLY subscriber pays, and still earns nothing: the badge comes with the year', () => {
    const signal = foundingPaymentSignal(sub('active', [MONTHLY_BUSINESS]))
    expect(signal.paid).toBe(true) // money did move
    expect(signal.annual).toBe(false)
    expect(signal.earnsFounding).toBe(false)
    expect(signal.reason).toBe('not_annual')
  })

  it('a $0 base price earns nothing', () => {
    const signal = foundingPaymentSignal(
      sub('active', [item('business_base_year', { interval: 'year', unitAmount: 0 })]),
    )
    expect(signal.earnsFounding).toBe(false)
    expect(signal.reason).toBe('zero_amount')
  })

  it('a 100%-off promotion code earns nothing, however ACTIVE the subscription looks', () => {
    const signal = foundingPaymentSignal(
      sub('active', [ANNUAL_BUSINESS], { discounts: [{ coupon: { percent_off: 100 } }] }),
    )
    expect(signal.earnsFounding).toBe(false)
    expect(signal.reason).toBe('zero_amount')
  })

  it('an amount_off coupon that covers the whole base earns nothing; a partial one still counts', () => {
    expect(
      foundingPaymentSignal(sub('active', [ANNUAL_BUSINESS], { discounts: [{ coupon: { amount_off: 19000 } }] }))
        .earnsFounding,
    ).toBe(false)
    expect(
      foundingPaymentSignal(sub('active', [ANNUAL_BUSINESS], { discounts: [{ coupon: { amount_off: 5000 } }] }))
        .earnsFounding,
    ).toBe(true)
  })

  it('an invoice that COLLECTED nothing is the last word, even on a priced item', () => {
    const signal = foundingPaymentSignal(
      sub('active', [ANNUAL_BUSINESS], { latest_invoice: { amount_paid: 0 } }),
    )
    expect(signal.earnsFounding).toBe(false)
    expect(signal.reason).toBe('zero_amount')
  })

  it('an invoice that collected real money confirms the grant', () => {
    expect(
      foundingPaymentSignal(sub('active', [ANNUAL_BUSINESS], { latest_invoice: { amount_paid: 19000 } }))
        .earnsFounding,
    ).toBe(true)
  })

  it('an UN-EXPANDED latest_invoice (the normal webhook shape) is not evidence either way', () => {
    expect(invoiceAmountPaidCents(sub('active', [ANNUAL_BUSINESS], { latest_invoice: 'in_123' }))).toBeNull()
    expect(
      foundingPaymentSignal(sub('active', [ANNUAL_BUSINESS], { latest_invoice: 'in_123' })).earnsFounding,
    ).toBe(true)
  })

  it('an un-expanded discount id tells us nothing and never blocks a real payment', () => {
    expect(fullyDiscounted(sub('active', [ANNUAL_BUSINESS], { discounts: ['di_123'] }), 19000)).toBe(false)
  })

  it('the whole loadout is judged on its BASE: a $200 AI add-on cannot stand in for the plan', () => {
    const signal = foundingPaymentSignal(
      sub('active', [
        item('addon_ai_year', { interval: 'year', unitAmount: 20000 }),
        item('business_base_year', { interval: 'year', unitAmount: 19000 }),
      ]),
    )
    expect(signal.monthlyRateCents).toBe(1900)
    expect(signal.chargedCents).toBe(19000)
  })

  it('an ANNUAL Crew subscription (one un-keyed item) earns member founding at its monthly rate', () => {
    const signal = foundingPaymentSignal(sub('active', [item(null, { interval: 'year', unitAmount: 9000 })]))
    expect(signal.earnsFounding).toBe(true)
    expect(signal.monthlyRateCents).toBe(900)
  })
})
