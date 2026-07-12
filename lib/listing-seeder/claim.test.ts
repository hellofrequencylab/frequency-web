import { describe, it, expect } from 'vitest'

// The claim transfer guard is the safety spine: a seeded listing is claimable ONLY while it is still
// owned by the Frequency seed owner AND unclaimed. The DB transfer enforces this as CAS filters; this
// PURE guard is the same predicate (for a pre-check + regression coverage). The token is the events
// mint: a url-safe, one-time secret.

import { canClaimListing, mintClaimToken } from './claim'

const SEED = 'seed-owner-uuid'

describe('canClaimListing — the transfer guard', () => {
  it('allows a seed-owned, unclaimed row', () => {
    expect(canClaimListing({ ownerId: SEED, claimedAt: null }, SEED)).toBe(true)
    expect(canClaimListing({ ownerId: SEED, claimedAt: undefined }, SEED)).toBe(true)
  })

  it('rejects a row already claimed (owner already flipped away)', () => {
    expect(canClaimListing({ ownerId: 'real-member', claimedAt: null }, SEED)).toBe(false)
  })

  it('rejects a row with a claimed_at stamp even if still seed owned', () => {
    expect(canClaimListing({ ownerId: SEED, claimedAt: '2026-07-12T00:00:00Z' }, SEED)).toBe(false)
  })

  it('rejects when the seed owner cannot be resolved', () => {
    expect(canClaimListing({ ownerId: SEED, claimedAt: null }, null)).toBe(false)
  })
})

describe('mintClaimToken', () => {
  it('mints a url-safe, non-trivial, unique token each call', () => {
    const a = mintClaimToken()
    const b = mintClaimToken()
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThanOrEqual(24)
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/) // base64url alphabet, no padding
  })
})
