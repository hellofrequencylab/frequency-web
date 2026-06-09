import { describe, it, expect } from 'vitest'
import { toStatus } from './connect'

// `toStatus` is the pure derivation the UI and webhook both rely on: it maps the
// mirrored Stripe flags into onboarded/ready. Lock its truth table down.
describe('toStatus', () => {
  it('returns an empty, not-ready status for a null row (no account)', () => {
    const s = toStatus(null)
    expect(s.accountId).toBeNull()
    expect(s.chargesEnabled).toBe(false)
    expect(s.payoutsEnabled).toBe(false)
    expect(s.detailsSubmitted).toBe(false)
    expect(s.onboarded).toBe(false)
    expect(s.ready).toBe(false)
  })

  it('treats null flag columns as false (defensive against pre-migration rows)', () => {
    const s = toStatus({
      stripe_account_id: 'acct_1',
      stripe_charges_enabled: null,
      stripe_payouts_enabled: null,
      stripe_details_submitted: null,
    })
    expect(s.accountId).toBe('acct_1')
    expect(s.onboarded).toBe(false)
    expect(s.ready).toBe(false)
  })

  it('is onboarded once details are submitted, even before review clears', () => {
    const s = toStatus({
      stripe_account_id: 'acct_1',
      stripe_charges_enabled: false,
      stripe_payouts_enabled: false,
      stripe_details_submitted: true,
    })
    expect(s.onboarded).toBe(true)
    expect(s.ready).toBe(false)
  })

  it('is ready ONLY when charges AND payouts are both enabled', () => {
    const chargesOnly = toStatus({
      stripe_account_id: 'acct_1',
      stripe_charges_enabled: true,
      stripe_payouts_enabled: false,
      stripe_details_submitted: true,
    })
    expect(chargesOnly.ready).toBe(false)

    const payoutsOnly = toStatus({
      stripe_account_id: 'acct_1',
      stripe_charges_enabled: false,
      stripe_payouts_enabled: true,
      stripe_details_submitted: true,
    })
    expect(payoutsOnly.ready).toBe(false)

    const both = toStatus({
      stripe_account_id: 'acct_1',
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
      stripe_details_submitted: true,
    })
    expect(both.ready).toBe(true)
  })
})
