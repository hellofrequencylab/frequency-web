import { describe, it, expect } from 'vitest'
import { ticketTotalCents, spaceMembershipGateError } from './tickets'

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
