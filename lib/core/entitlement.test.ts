import { describe, it, expect } from 'vitest'
import { deriveTier } from '@/lib/core/entitlement'
import { accessTo } from '@/lib/core/access-matrix'

describe('deriveTier', () => {
  it('proxies paid from a crew-or-above role until the flag lands', () => {
    expect(deriveTier({ role: 'member' })).toBe('free')
    expect(deriveTier({ role: 'crew' })).toBe('member')
    expect(deriveTier({ role: 'host' })).toBe('member')
    expect(deriveTier({ role: 'janitor' })).toBe('member')
    expect(deriveTier({ role: null })).toBe('free')
    expect(deriveTier({})).toBe('free')
  })

  it('prefers the explicit billing flag when present (the post-billing path)', () => {
    expect(deriveTier({ role: 'member', membershipTier: 'member' })).toBe('member')
    expect(deriveTier({ role: 'member', membershipTier: 'supporter' })).toBe('supporter')
    // A free-tier flag wins even over a crew role (entitlement is orthogonal).
    expect(deriveTier({ role: 'host', membershipTier: 'free' })).toBe('free')
  })

  it('feeds the access matrix so the ✋ gate tracks the tier', () => {
    const free = { loggedIn: true, role: 'member' as const, tier: deriveTier({ role: 'member' }) }
    const paid = { loggedIn: true, role: 'member' as const, tier: deriveTier({ role: 'member', membershipTier: 'member' }) }
    expect(accessTo('vault', free)).toBe('limited')
    expect(accessTo('vault', paid)).toBe('full')
  })
})
