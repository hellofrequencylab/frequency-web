import { describe, it, expect } from 'vitest'
import { canTakePayments, canListNew } from './selling'

// Phase 0 (Etsy-Grade Market) role/permission gate. These predicates are the single source of truth
// for R2 (who may take in-app payments) and R3 (who may list a New product).

describe('canTakePayments (R2: every owner kind may take in-app payments — OWN-046, 2026-09-08)', () => {
  it('allows a Business Space Shop and the Frequency Store', () => {
    expect(canTakePayments('space')).toBe(true)
    expect(canTakePayments('platform')).toBe(true)
  })

  // WAS `.toBe(false)` until the 2026-09-08 owner ruling that member-to-member Market sales settle
  // in-app. The predicate is now constant; it is kept (not inlined) because it is the one named
  // place a future `charges_enabled` check ANDs in, and two call sites read it.
  it('allows an individual maker — the connect-only rule is retired', () => {
    expect(canTakePayments('profile')).toBe(true)
  })

  // 🔴 THE CONTROL THAT MATTERS MORE THAN THE FLIP. Widening R2 must not widen R3 with it: an
  // individual still lists Used only. The two predicates have identical bodies and sit ten lines
  // apart, which is exactly how a later edit widens both by accident.
  it('does NOT widen canListNew — R2 and R3 are separate rulings', () => {
    expect(canTakePayments('profile')).toBe(true)
    expect(canListNew('profile')).toBe(false)
  })
})

describe('canListNew (R3: listing New requires a Business/platform account)', () => {
  it('allows a Business Space Shop and the Frequency Store', () => {
    expect(canListNew('space')).toBe(true)
    expect(canListNew('platform')).toBe(true)
  })

  it('denies an individual maker (Used only)', () => {
    expect(canListNew('profile')).toBe(false)
  })
})
