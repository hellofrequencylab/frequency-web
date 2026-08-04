import { describe, it, expect } from 'vitest'
import { ANNUAL_MONTHS_FREE, yearlyFromMonthly, monthlyFromYearly } from '@/lib/billing/pricing-keys'
import { annualDiscountNote } from '@/lib/pricing/display'
import { PRICING_DEFAULTS } from '@/lib/pricing/defaults'

// ─────────────────────────────────────────────────────────────────────────────
// The quote a member READS and the amount Stripe CHARGES must come from one number.
//
// They did not. `annualDiscountNote` read the operator knob `annual_discount.months_free`
// (settable at /admin/pricing, rendered on every plan card via pricing-grid and in the
// pricing FAQ) while `yearlyFromMonthly` hardcoded a 10x multiple. Both were unit-tested —
// the note as a string formatter, the multiple as arithmetic — and neither test could fail,
// because no test asserted the relationship BETWEEN them, and no code path connected them.
//
// They agreed only because the default knob value happened to be 2. The first operator to
// run a "3 months free" promo would have published that sentence sitewide while checkout
// kept billing ten months: quoted 25% off, charged 16.7%.
//
// These assertions are the connection. They fail if anyone reintroduces a second source.
// ─────────────────────────────────────────────────────────────────────────────
describe('the annual discount a member is quoted equals the one they are charged', () => {
  it('derives the yearly multiple from ANNUAL_MONTHS_FREE, not a hardcoded factor', () => {
    // A year bills (12 - monthsFree) months.
    expect(yearlyFromMonthly(1000)).toBe(1000 * (12 - ANNUAL_MONTHS_FREE))
    expect(yearlyFromMonthly(2900)).toBe(2900 * (12 - ANNUAL_MONTHS_FREE))
  })

  it('quotes the same number of free months that the billing math actually gives', () => {
    const note = annualDiscountNote(PRICING_DEFAULTS)
    const spelled = ['zero', 'one', 'two', 'three', 'four', 'five'][ANNUAL_MONTHS_FREE]
    expect(note.toLowerCase()).toContain(spelled ?? String(ANNUAL_MONTHS_FREE))
  })

  it('is not moved by the operator knob, which no charging path reads', () => {
    // The knob can be set to anything; the sentence must keep describing the real charge.
    const promo = { ...PRICING_DEFAULTS, annual_discount: { months_free: 5 } }
    expect(annualDiscountNote(promo)).toBe(annualDiscountNote(PRICING_DEFAULTS))
  })

  it('round-trips: a yearly amount normalizes back to the monthly rate it was built from', () => {
    for (const monthly of [900, 1900, 2900, 3900, 9900]) {
      expect(monthlyFromYearly(yearlyFromMonthly(monthly))).toBe(monthly)
    }
  })
})
