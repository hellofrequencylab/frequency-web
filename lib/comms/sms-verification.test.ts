import { describe, it, expect } from 'vitest'
import {
  normalizeE164,
  generateSmsCode,
  hashSmsCode,
  checkSmsCode,
  SMS_CODE_MAX_ATTEMPTS,
  type PendingVerification,
} from './sms-verification'

const KEY = 'unit-test-key'
const PHONE = '+15555550123'

describe('normalizeE164', () => {
  it('assumes +1 for a bare 10-digit US number', () => {
    expect(normalizeE164('5555550123')).toBe('+15555550123')
    expect(normalizeE164('(555) 555-0123')).toBe('+15555550123')
  })

  it('prefixes + for an 11-digit number starting with 1', () => {
    expect(normalizeE164('15555550123')).toBe('+15555550123')
  })

  it('passes through an already-+ international number of valid length', () => {
    expect(normalizeE164('+447911123456')).toBe('+447911123456')
  })

  it('returns null for ambiguous / invalid input (fail-closed)', () => {
    expect(normalizeE164('')).toBeNull()
    expect(normalizeE164('123')).toBeNull()
    expect(normalizeE164('not a phone')).toBeNull()
    expect(normalizeE164('+1')).toBeNull()
  })
})

describe('generateSmsCode', () => {
  it('is always a zero-padded 6-digit string', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateSmsCode()
      expect(code).toMatch(/^\d{6}$/)
    }
  })
})

describe('hashSmsCode — bound to the phone', () => {
  it('the same code on a different number yields a different hash', () => {
    expect(hashSmsCode('123456', PHONE, KEY)).not.toBe(hashSmsCode('123456', '+15555559999', KEY))
  })

  it('a different key yields a different hash (keyed)', () => {
    expect(hashSmsCode('123456', PHONE, KEY)).not.toBe(hashSmsCode('123456', PHONE, 'other'))
  })
})

describe('checkSmsCode', () => {
  const code = '654321'
  const fresh = (over: Partial<PendingVerification> = {}): PendingVerification => ({
    codeHash: hashSmsCode(code, PHONE, KEY),
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    attempts: 0,
    ...over,
  })

  it('accepts the matching code within the window', () => {
    expect(checkSmsCode(fresh(), code, PHONE, KEY)).toEqual({ ok: true })
  })

  it('rejects a mismatched code', () => {
    expect(checkSmsCode(fresh(), '000000', PHONE, KEY)).toEqual({ ok: false, reason: 'mismatch' })
  })

  it('rejects an expired code (expiry checked first)', () => {
    const expired = fresh({ expiresAt: new Date(Date.now() - 1000).toISOString() })
    expect(checkSmsCode(expired, code, PHONE, KEY)).toEqual({ ok: false, reason: 'expired' })
  })

  it('rejects once the attempt cap is hit', () => {
    const capped = fresh({ attempts: SMS_CODE_MAX_ATTEMPTS })
    expect(checkSmsCode(capped, code, PHONE, KEY)).toEqual({ ok: false, reason: 'too_many_attempts' })
  })

  it('rejects a code verified against the wrong phone (hash is phone-bound)', () => {
    expect(checkSmsCode(fresh(), code, '+15555559999', KEY)).toEqual({ ok: false, reason: 'mismatch' })
  })
})
