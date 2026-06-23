import { describe, it, expect } from 'vitest'
import { signState, verifyState } from './state'

// Give the HMAC a deterministic key for the suite (read lazily by sign/verify at call time).
process.env.OAUTH_STATE_SECRET = 'unit-test-state-secret'

describe('oauth state', () => {
  it('round-trips a state bound to the same profile id', () => {
    const s = signState('profile-1')
    expect(verifyState(s, 'profile-1')).toBe(true)
  })

  it('rejects a state bound to a different profile id (CSRF defense)', () => {
    const s = signState('profile-1')
    expect(verifyState(s, 'profile-2')).toBe(false)
  })

  it('rejects a tampered signature', () => {
    const s = signState('profile-1')
    const flipped = s.slice(0, -1) + (s.endsWith('A') ? 'B' : 'A')
    expect(verifyState(flipped, 'profile-1')).toBe(false)
  })

  it('rejects a tampered body', () => {
    const s = signState('profile-1')
    const [, sig] = s.split('.')
    const forged = Buffer.from(JSON.stringify({ pid: 'profile-2', iat: Date.now(), nonce: 'x' }))
      .toString('base64url')
    expect(verifyState(`${forged}.${sig}`, 'profile-2')).toBe(false)
  })

  it('rejects a stale state (older than the freshness window)', () => {
    const s = signState('profile-1')
    expect(verifyState(s, 'profile-1', Date.now() + 11 * 60 * 1000)).toBe(false)
  })

  it('rejects a state minted in the future (clock skew guard)', () => {
    const s = signState('profile-1')
    expect(verifyState(s, 'profile-1', Date.now() - 5 * 60 * 1000)).toBe(false)
  })

  it('fails closed on malformed input', () => {
    expect(verifyState(null, 'profile-1')).toBe(false)
    expect(verifyState(undefined, 'profile-1')).toBe(false)
    expect(verifyState('', 'profile-1')).toBe(false)
    expect(verifyState('no-dot-here', 'profile-1')).toBe(false)
    expect(verifyState('.', 'profile-1')).toBe(false)
  })
})
