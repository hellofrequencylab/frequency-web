import { describe, it, expect } from 'vitest'
import { deriveTier, isPaid } from '@/lib/core/entitlement'
import { accessTo } from '@/lib/core/access-matrix'

describe('deriveTier', () => {
  it('returns the billing flag, defaulting to free', () => {
    expect(deriveTier('free')).toBe('free')
    expect(deriveTier('crew')).toBe('crew')
    expect(deriveTier('supporter')).toBe('supporter')
    expect(deriveTier(null)).toBe('free')
    expect(deriveTier(undefined)).toBe('free')
  })
})

describe('isPaid', () => {
  it('Crew and Supporter are paid; free is not', () => {
    expect(isPaid('free')).toBe(false)
    expect(isPaid('crew')).toBe(true)
    expect(isPaid('supporter')).toBe(true)
    expect(isPaid(null)).toBe(false)
  })
})

describe('entitlement feeds the access matrix (the ✋ gate tracks the tier)', () => {
  it('free member is gated on the Vault; Crew unlocks it', () => {
    expect(accessTo('vault', { loggedIn: true, role: 'member', tier: 'free' })).toBe('limited')
    expect(accessTo('vault', { loggedIn: true, role: 'member', tier: 'crew' })).toBe('full')
    expect(accessTo('vault', { loggedIn: true, role: 'member', tier: 'supporter' })).toBe('full')
  })
})
