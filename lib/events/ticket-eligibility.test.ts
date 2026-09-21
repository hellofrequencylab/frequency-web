import { describe, it, expect } from 'vitest'
import {
  ticketSellerVerdict,
  canSellTickets,
  payoutScopeKey,
  PAYOUT_SCOPE_SELF,
  NEEDS_PAYOUT_ACCOUNT,
  buyerMaySeePrice,
} from './ticket-eligibility'

// The predicate is pure and total, and it is the ONE thing standing between a host who priced an
// event and a buyer whose money would strand. These cases are the ones the render depends on.

describe('ticketSellerVerdict', () => {
  it('allows a payee whose Connect onboarding is complete', () => {
    expect(ticketSellerVerdict({ payoutsReady: true })).toEqual({ allowed: true, step: null })
    expect(canSellTickets({ payoutsReady: true })).toBe(true)
  })

  it('FAILS CLOSED on every non-true value, including unknown', () => {
    for (const payoutsReady of [false, null, undefined]) {
      const v = ticketSellerVerdict({ payoutsReady })
      expect(v.allowed).toBe(false)
      expect(v.allowed === false && v.step).toBe('connect_payouts')
      expect(v.allowed === false && v.reason).toBe(NEEDS_PAYOUT_ACCOUNT)
    }
    expect(canSellTickets({})).toBe(false)
  })
})

describe('payoutScopeKey', () => {
  // The three encodings the event form's scope state actually holds. A miss here reads as
  // "not ready", so it would surface as a host being nagged forever rather than as a crash.
  it('maps the public sentinel, and anything empty, to self', () => {
    expect(payoutScopeKey('__public__')).toBe(PAYOUT_SCOPE_SELF)
    expect(payoutScopeKey('')).toBe(PAYOUT_SCOPE_SELF)
    expect(payoutScopeKey(null)).toBe(PAYOUT_SCOPE_SELF)
    expect(payoutScopeKey(undefined)).toBe(PAYOUT_SCOPE_SELF)
  })

  it('strips the space: prefix the create form encodes with', () => {
    expect(payoutScopeKey('space:abc-123')).toBe('abc-123')
  })

  it('passes a bare id through, which is how the edit page seeds scope state', () => {
    expect(payoutScopeKey('circle-9')).toBe('circle-9')
    expect(payoutScopeKey('abc-123')).toBe('abc-123')
  })

  it('agrees across the two encodings of the SAME space, which is the whole point', () => {
    expect(payoutScopeKey('space:s1')).toBe(payoutScopeKey('s1'))
  })
})


describe('buyerMaySeePrice', () => {
  // The rule OWN-074 measured the cost of: a live $55 tickets-mode event whose host has no Connect
  // account, priced on every card and in every rich result, and unbuyable to everyone.
  it('withholds a TICKETS-mode price when the payee cannot be paid', () => {
    for (const payoutsReady of [false, null, undefined]) {
      expect(buyerMaySeePrice({ ticketsMode: true, payoutsReady })).toBe(false)
    }
  })

  it('shows a TICKETS-mode price when the payee is ready', () => {
    expect(buyerMaySeePrice({ ticketsMode: true, payoutsReady: true })).toBe(true)
  })

  // 🔴 THE HALF THAT IS EASY TO GET WRONG. An RSVP-mode price is collected AT THE DOOR (LIVE-314):
  // nothing goes through checkout at RSVP time, the flow already says "Pay the $22 at the door",
  // and a signed-in member gets full RSVP controls whether or not payouts are connected. Hiding
  // that number would delete true information and re-close the guest door LIVE-314 opened.
  it('never withholds an RSVP-mode price, whatever the payout state', () => {
    for (const payoutsReady of [true, false, null, undefined]) {
      expect(buyerMaySeePrice({ ticketsMode: false, payoutsReady })).toBe(true)
    }
  })
})
