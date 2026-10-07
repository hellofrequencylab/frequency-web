import { describe, it, expect } from 'vitest'
import { canTakePayments, canListNew } from './selling'

// Phase 0 (Etsy-Grade Market) role/permission gate. These predicates are the single source of truth
// for R2 (who may take in-app payments) and R3 (who may list a New product).

describe('canTakePayments (R2: personal selling is off, ADR-1709 / LIVE-753)', () => {
  it('allows a Space Shop and the Frequency Store (the Space still clears the plan gate at checkout)', () => {
    expect(canTakePayments('space')).toBe(true)
    expect(canTakePayments('platform')).toBe(true)
  })

  // WAS `.toBe(true)` under the 2026-09-08 ruling (OWN-046). ADR-1709 turned personal selling off on
  // every personal tier: a personal listing is an inquiry, and the money a person receives is tips.
  it('refuses an individual maker', () => {
    expect(canTakePayments('profile')).toBe(false)
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
