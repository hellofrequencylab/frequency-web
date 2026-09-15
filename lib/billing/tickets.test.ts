import { describe, it, expect, afterEach } from 'vitest'
import {
  ticketTotalCents,
  spaceMembershipGateError,
  ticketPaymentMethodParams,
  TICKET_PMC_ENV,
} from './tickets'

// `ticketTotalCents` is the pure gross-amount derivation behind a ticket purchase.
describe('ticketTotalCents', () => {
  it('multiplies unit price by quantity', () => {
    expect(ticketTotalCents(1000, 1)).toBe(1000)
    expect(ticketTotalCents(1000, 3)).toBe(3000)
    expect(ticketTotalCents(250, 4)).toBe(1000)
  })

  it('floors a fractional quantity to whole tickets', () => {
    expect(ticketTotalCents(1000, 2.9)).toBe(2000)
  })

  it('returns 0 for a free/invalid price or non-positive quantity', () => {
    expect(ticketTotalCents(0, 2)).toBe(0)
    expect(ticketTotalCents(-100, 2)).toBe(0)
    expect(ticketTotalCents(NaN, 2)).toBe(0)
    expect(ticketTotalCents(1000, 0)).toBe(0)
    expect(ticketTotalCents(1000, -1)).toBe(0)
  })
})

// `spaceMembershipGateError` is the pure decision behind a membership-linked ticket (ADR-823):
// given a tier's gate and the buyer's active membership in the hosting Space, is the buy allowed?
describe('spaceMembershipGateError', () => {
  const open = { space_members_only: false, space_tier_id: null }
  const membersOnly = { space_members_only: true, space_tier_id: null }
  const tierOnly = { space_members_only: true, space_tier_id: 'mt-1' }

  it('never blocks an ungated tier, member or not', () => {
    expect(spaceMembershipGateError(open, null, 'Royal Temple')).toBeNull()
    expect(spaceMembershipGateError(open, { tier_id: 'mt-1' }, 'Royal Temple')).toBeNull()
  })

  it('blocks a non-member on a members-only tier, naming the space', () => {
    expect(spaceMembershipGateError(membersOnly, null, 'Royal Temple')).toContain('Royal Temple')
  })

  it('clears any active membership when no specific tier is named', () => {
    expect(spaceMembershipGateError(membersOnly, { tier_id: 'mt-2' }, 'Royal Temple')).toBeNull()
  })

  it('requires THE named membership tier when one is set', () => {
    expect(spaceMembershipGateError(tierOnly, { tier_id: 'mt-1' }, 'Royal Temple')).toBeNull()
    expect(spaceMembershipGateError(tierOnly, { tier_id: 'mt-2' }, 'Royal Temple')).toContain(
      'different',
    )
    expect(spaceMembershipGateError(tierOnly, null, 'Royal Temple')).toContain('Join')
  })

  it('treats a named tier as implying the members gate even if the flag is off', () => {
    // Defensive: a row written before the flag/id invariant (space_tier_id forces
    // space_members_only in parseTicketTierInput) must still gate.
    const flagOff = { space_members_only: false, space_tier_id: 'mt-1' }
    expect(spaceMembershipGateError(flagOff, null, 'Royal Temple')).not.toBeNull()
    expect(spaceMembershipGateError(flagOff, { tier_id: 'mt-1' }, 'Royal Temple')).toBeNull()
  })
})

// A ticket is TIMED INVENTORY, so the ticket checkout is the one creator in this repo that narrows
// the payment-method set (LIVE-343, owner decision). A delayed-notification method (ACH debit, a
// bank redirect) completes Checkout WITHOUT paying and settles three to five days later, which
// cannot share a product with a 30 minute seat hold.
describe('ticketPaymentMethodParams', () => {
  const ORIGINAL = process.env[TICKET_PMC_ENV]

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env[TICKET_PMC_ENV]
    else process.env[TICKET_PMC_ENV] = ORIGINAL
  })

  it('PREFERS a payment method configuration, so the Stripe dashboard still controls the set', () => {
    process.env[TICKET_PMC_ENV] = 'pmc_instant_only'
    expect(ticketPaymentMethodParams()).toEqual({ payment_method_configuration: 'pmc_instant_only' })
  })

  it('never sends both parameters: Stripe rejects a request carrying the two', () => {
    process.env[TICKET_PMC_ENV] = 'pmc_instant_only'
    expect(ticketPaymentMethodParams()).not.toHaveProperty('payment_method_types')
    delete process.env[TICKET_PMC_ENV]
    expect(ticketPaymentMethodParams()).not.toHaveProperty('payment_method_configuration')
  })

  it('falls back to card + link when no configuration id is set', () => {
    delete process.env[TICKET_PMC_ENV]
    // Apple Pay and Google Pay are not types: they ride on `card`. Link is its own type and
    // disappears from Checkout unless it is named, which is the one easy thing to get wrong here.
    expect(ticketPaymentMethodParams()).toEqual({ payment_method_types: ['card', 'link'] })
  })

  it('offers NO delayed-notification method on either branch', () => {
    delete process.env[TICKET_PMC_ENV]
    const types = (ticketPaymentMethodParams() as { payment_method_types: string[] }).payment_method_types
    // The whole point of the row: these are the methods that complete a session unpaid.
    for (const delayed of ['us_bank_account', 'sofort', 'bancontact', 'ideal', 'cashapp', 'klarna', 'afterpay_clearpay']) {
      expect(types).not.toContain(delayed)
    }
  })

  it('treats a blank or whitespace env value as unset rather than as an id', () => {
    // A blank var is the normal state of an optional key in a copied .env, and sending
    // `payment_method_configuration: ''` to Stripe is a request error, not a no-op.
    process.env[TICKET_PMC_ENV] = '   '
    expect(ticketPaymentMethodParams()).toEqual({ payment_method_types: ['card', 'link'] })
  })
})
