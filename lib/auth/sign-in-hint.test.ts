import { describe, it, expect } from 'vitest'
import {
  decodeSignInHint,
  encodeSignInHint,
  lastSignInMethod,
  maskEmail,
  signInHintSentence,
} from './sign-in-hint'

// ADR-1392: the device-local "last time you signed in with…" hint. It renders on the sign-in page from
// a cookie, so the shape is strict both ways and the address is never stored whole.

describe('maskEmail', () => {
  it('keeps the first character and the domain only', () => {
    expect(maskEmail('Meghan.Riley@Gmail.com')).toBe('m•••@gmail.com')
    expect(maskEmail('theroyalreset11@gmail.com')).toBe('t•••@gmail.com')
  })
  it('refuses anything that is not a plausible address', () => {
    for (const bad of ['', null, undefined, 'no-at-sign', '@gmail.com', 'x@', 'x@nodot', '.x@gmail.com']) {
      expect(maskEmail(bad as string)).toBeNull()
    }
  })
})

describe('lastSignInMethod', () => {
  it('picks the identity with the most recent sign-in', () => {
    const identities = [
      { provider: 'email', last_sign_in_at: '2026-09-01T00:00:00Z' },
      { provider: 'google', last_sign_in_at: '2026-09-16T00:00:00Z' },
    ]
    expect(lastSignInMethod(identities)).toBe('google')
    expect(lastSignInMethod([{ ...identities[0], last_sign_in_at: '2026-09-17T00:00:00Z' }, identities[1]])).toBe('email')
  })
  it('falls back to the app provider, then to the email link', () => {
    expect(lastSignInMethod([], 'google')).toBe('google')
    expect(lastSignInMethod(null)).toBe('email')
  })
})

describe('the cookie round trip', () => {
  it('decodes exactly what it encodes', () => {
    const hint = { method: 'google' as const, masked: 'm•••@gmail.com' }
    expect(decodeSignInHint(encodeSignInHint(hint))).toEqual(hint)
  })
  it('ignores a tampered value instead of rendering it', () => {
    for (const bad of [
      'google|Call 555-0100 to unlock your account',
      'google|meghan@gmail.com',
      'facebook|m•••@gmail.com',
      'google|m•••@gmail.com|extra',
      'email|•••@gmail.com',
      '',
      null,
    ]) {
      expect(decodeSignInHint(bad as string)).toBeNull()
    }
  })
  it('says which door, in plain words and with no em dash', () => {
    expect(signInHintSentence({ method: 'google', masked: 'm•••@gmail.com' })).toBe(
      'Last time you signed in with Google (m•••@gmail.com).',
    )
    expect(signInHintSentence({ method: 'email', masked: 't•••@gmail.com' })).toBe(
      'Last time you signed in with an email link to t•••@gmail.com.',
    )
  })
})
