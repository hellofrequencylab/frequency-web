import { describe, expect, it } from 'vitest'
import { challengeExpiry, issueChallenge, verifyStaffProof } from './staff-proof'

const secret = 'test-secret'
const scope = { huntId: 'hunt-1', placementId: 'pl-1', venueSpaceId: 'space-a', runId: 'run-1' }
const NOW = 1_800_000_000

const seen = () => {
  const used = new Set<string>()
  return async (nonce: string) => {
    if (used.has(nonce)) return false
    used.add(nonce)
    return true
  }
}

const check = (over: Partial<Parameters<typeof verifyStaffProof>[0]> & { token: string }) =>
  verifyStaffProof({
    secret,
    now: NOW + 10,
    expected: scope,
    staffVenueSpaceIds: ['space-a'],
    placementActive: true,
    consumeNonce: seen(),
    ...over,
  })

describe('staff proof', () => {
  it('accepts a fresh challenge from staff of the venue', async () => {
    const token = issueChallenge({ secret, scope, now: NOW })
    const res = await check({ token })
    expect(res.ok).toBe(true)
  })

  it('rejects staff of another Space', async () => {
    const token = issueChallenge({ secret, scope, now: NOW })
    expect(await check({ token, staffVenueSpaceIds: ['space-b'] })).toEqual({ ok: false, reason: 'cross_space_staff' })
  })

  it('rejects a replay of the same challenge', async () => {
    const token = issueChallenge({ secret, scope, now: NOW })
    const consumeNonce = seen()
    expect((await check({ token, consumeNonce })).ok).toBe(true)
    expect(await check({ token, consumeNonce })).toEqual({ ok: false, reason: 'replay' })
  })

  it('rejects an expired challenge, and one from the future', async () => {
    const token = issueChallenge({ secret, scope, now: NOW, ttlSeconds: 60 })
    expect(await check({ token, now: NOW + 60 })).toEqual({ ok: false, reason: 'expired' })
    expect(await check({ token, now: NOW - 5 })).toEqual({ ok: false, reason: 'expired' })
  })

  it('rejects a paused placement', async () => {
    const token = issueChallenge({ secret, scope, now: NOW })
    expect(await check({ token, placementActive: false })).toEqual({ ok: false, reason: 'placement_paused' })
  })

  it('rejects another run, placement, Hunt or venue', async () => {
    const token = issueChallenge({ secret, scope, now: NOW })
    for (const expected of [
      { ...scope, runId: 'run-2' },
      { ...scope, placementId: 'pl-2' },
      { ...scope, huntId: 'hunt-2' },
      { ...scope, venueSpaceId: 'space-b' },
    ]) {
      expect(await check({ token, expected, staffVenueSpaceIds: ['space-a', 'space-b'] })).toEqual({ ok: false, reason: 'wrong_scope' })
    }
  })

  it('rejects a forged or malformed token', async () => {
    const token = issueChallenge({ secret, scope, now: NOW })
    expect(await check({ token, secret: 'other' })).toEqual({ ok: false, reason: 'bad_signature' })
    expect(await check({ token: token.slice(0, -2) + 'xx' })).toEqual({ ok: false, reason: 'bad_signature' })
    expect(await check({ token: 'nope' })).toEqual({ ok: false, reason: 'malformed' })
    expect(await check({ token: 'v1.%%%.sig' })).toEqual({ ok: false, reason: 'malformed' })
  })

  it('does not burn the nonce on a refusal', async () => {
    const token = issueChallenge({ secret, scope, now: NOW })
    const consumeNonce = seen()
    expect((await check({ token, consumeNonce, placementActive: false })).ok).toBe(false)
    expect((await check({ token, consumeNonce })).ok).toBe(true)
  })
})

describe('challengeExpiry', () => {
  it('reads the expiry a token claims and nothing from a malformed one', () => {
    const token = issueChallenge({ secret: 's', scope: { huntId: 'h', placementId: 'p', venueSpaceId: 'v', runId: 'r' }, now: 1000, ttlSeconds: 60 })
    expect(challengeExpiry(token)).toBe(1060)
    expect(challengeExpiry('nope')).toBeNull()
  })
})
