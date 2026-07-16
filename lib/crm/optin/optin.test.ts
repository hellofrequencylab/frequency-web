import { describe, it, expect, beforeAll } from 'vitest'
import { makeOptinToken, verifyOptinToken, buildOptinConfirmUrl, OPTIN_TOKEN_TTL_DAYS } from './tokens'
import { decideOptinRequest, optinConfirmTarget } from './store'

// Sign with a deterministic secret so token tests are hermetic.
beforeAll(() => {
  process.env.OPTIN_CONFIRM_SECRET = 'test-optin-secret-000000000000000000'
})

describe('optin tokens', () => {
  const email = 'Alex@Example.com'
  const future = Math.floor(Date.now() / 1000) + 3600

  it('round-trips a valid token (case-insensitive email)', () => {
    const token = makeOptinToken(email, future)
    expect(verifyOptinToken(email, future, token)).toBe(true)
    // Same address, different casing / whitespace → same signature.
    expect(verifyOptinToken('  alex@example.com ', future, token)).toBe(true)
  })

  it('rejects a token for a different email', () => {
    const token = makeOptinToken(email, future)
    expect(verifyOptinToken('mallory@example.com', future, token)).toBe(false)
  })

  it('rejects a token whose expiry was tampered', () => {
    const token = makeOptinToken(email, future)
    expect(verifyOptinToken(email, future + 1, token)).toBe(false)
  })

  it('rejects an expired token even with a valid signature', () => {
    const past = Math.floor(Date.now() / 1000) - 10
    const token = makeOptinToken(email, past)
    expect(verifyOptinToken(email, past, token)).toBe(false)
  })

  it('rejects malformed tokens and bad expiries', () => {
    expect(verifyOptinToken(email, future, '')).toBe(false)
    expect(verifyOptinToken(email, future, 'short')).toBe(false)
    expect(verifyOptinToken(email, NaN, makeOptinToken(email, future))).toBe(false)
    expect(verifyOptinToken(email, 0, makeOptinToken(email, 0))).toBe(false)
  })

  it('builds a confirm URL that verifies end-to-end', () => {
    const url = buildOptinConfirmUrl('https://frequencylocal.com/', email, OPTIN_TOKEN_TTL_DAYS)
    const parsed = new URL(url)
    expect(parsed.pathname).toBe('/subscribe/confirm')
    const e = parsed.searchParams.get('e')!
    const xNum = Number(parsed.searchParams.get('x'))
    const tok = parsed.searchParams.get('t')!
    expect(e).toBe('alex@example.com')
    expect(verifyOptinToken(e, xNum, tok)).toBe(true)
  })
})

describe('decideOptinRequest', () => {
  it('sends a confirm for a brand-new / unknown contact', () => {
    expect(decideOptinRequest({ consentState: null, suppressed: false })).toBe('send_confirm')
    expect(decideOptinRequest({ consentState: 'unknown', suppressed: false })).toBe('send_confirm')
  })

  it('never mails a suppressed address (hard block wins)', () => {
    expect(decideOptinRequest({ consentState: 'unknown', suppressed: true })).toBe('skip_suppressed')
    // Suppression outranks even an unsubscribed / subscribed state.
    expect(decideOptinRequest({ consentState: 'subscribed', suppressed: true })).toBe('skip_suppressed')
  })

  it('honors a hard opt-out (never re-mails an unsubscribed contact)', () => {
    expect(decideOptinRequest({ consentState: 'unsubscribed', suppressed: false })).toBe('skip_unsubscribed')
  })

  it('does nothing for an already-subscribed contact', () => {
    expect(decideOptinRequest({ consentState: 'subscribed', suppressed: false })).toBe('skip_subscribed')
  })
})

describe('optinConfirmTarget', () => {
  it('flips an unknown / new contact to subscribed', () => {
    expect(optinConfirmTarget('unknown')).toEqual({ write: true, consentState: 'subscribed', status: 'confirmed' })
    expect(optinConfirmTarget(null)).toEqual({ write: true, consentState: 'subscribed', status: 'confirmed' })
  })

  it('is idempotent for an already-subscribed contact', () => {
    expect(optinConfirmTarget('subscribed')).toEqual({ write: true, consentState: 'subscribed', status: 'confirmed' })
  })

  it('never resurrects a hard opt-out', () => {
    expect(optinConfirmTarget('unsubscribed')).toEqual({
      write: false,
      consentState: 'unsubscribed',
      status: 'kept_unsubscribed',
    })
  })
})
