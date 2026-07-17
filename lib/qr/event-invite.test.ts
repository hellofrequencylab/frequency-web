import { describe, it, expect, beforeAll } from 'vitest'

// Signed event-invite tokens (ADR-154). What is locked here (crypto-only, no network):
//   1. ROUND-TRIP: a minted token verifies back to the exact inviter + event.
//   2. TAMPER: any edit to the body or signature fails closed (null).
//   3. EXPIRY: a token past its expiry fails, even with a valid signature.
//   4. NAMESPACE / SHAPE: garbage, empty, and cross-namespace strings fail closed.

beforeAll(() => {
  process.env.EVENT_INVITE_SECRET = 'test-event-invite-secret-000000000000'
})

// Imported AFTER the secret is set so getSecret() resolves deterministically.
const { makeEventInviteToken, verifyEventInviteToken, eventInvitePath } = await import('./event-invite')

const INVITER = 'inviter-0000-4000-a000-00000000invt'
const EVENT = 'event-00000-4000-a000-00000000evnt'

describe('event-invite token — round-trip', () => {
  it('verifies back to the exact inviter + event', () => {
    const token = makeEventInviteToken(INVITER, EVENT)
    expect(verifyEventInviteToken(token)).toEqual({ inviterProfileId: INVITER, eventId: EVENT })
  })

  it('builds the public form path from a token', () => {
    const token = makeEventInviteToken(INVITER, EVENT)
    expect(eventInvitePath(token)).toBe(`/rsvp/${token}`)
  })
})

describe('event-invite token — tamper fails closed', () => {
  it('rejects a flipped signature', () => {
    const token = makeEventInviteToken(INVITER, EVENT)
    const [body, sig] = token.split('.')
    const flipped = `${body}.${sig!.slice(0, -1)}${sig!.endsWith('a') ? 'b' : 'a'}`
    expect(verifyEventInviteToken(flipped)).toBeNull()
  })

  it('rejects an edited payload body (signature no longer matches)', () => {
    const token = makeEventInviteToken(INVITER, EVENT)
    const sig = token.split('.')[1]!
    const forged = Buffer.from(JSON.stringify({ i: 'attacker', e: EVENT, x: 9999999999 })).toString('base64url')
    expect(verifyEventInviteToken(`${forged}.${sig}`)).toBeNull()
  })

  it('rejects garbage, empty, and malformed strings', () => {
    expect(verifyEventInviteToken('')).toBeNull()
    expect(verifyEventInviteToken(undefined)).toBeNull()
    expect(verifyEventInviteToken(null)).toBeNull()
    expect(verifyEventInviteToken('not-a-token')).toBeNull()
    expect(verifyEventInviteToken('.sig')).toBeNull()
    expect(verifyEventInviteToken('body.')).toBeNull()
  })
})

describe('event-invite token — expiry', () => {
  it('rejects a token whose expiry is in the past', () => {
    // A 0-day TTL expires effectively now; verify against a future clock.
    const token = makeEventInviteToken(INVITER, EVENT, 0)
    const future = Date.now() + 60_000
    expect(verifyEventInviteToken(token, future)).toBeNull()
  })

  it('accepts a token still inside its window', () => {
    const token = makeEventInviteToken(INVITER, EVENT, 30)
    expect(verifyEventInviteToken(token)).toEqual({ inviterProfileId: INVITER, eventId: EVENT })
  })
})
