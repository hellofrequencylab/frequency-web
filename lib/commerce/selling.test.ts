import { describe, it, expect } from 'vitest'
import { canTakePayments, canListNew } from './selling'

// Phase 0 (Etsy-Grade Market) role/permission gate. These predicates are the single source of truth
// for R2 (who may take in-app payments) and R3 (who may list a New product).

describe('canTakePayments (R2: in-app payments require a Business/platform account)', () => {
  it('allows a Business Space Shop and the Frequency Store', () => {
    expect(canTakePayments('space')).toBe(true)
    expect(canTakePayments('platform')).toBe(true)
  })

  it('denies an individual maker (connect-only)', () => {
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
